import { Input, Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import fs from 'node:fs/promises';
import { ensureDir, uniqueDownloadPath } from './media.js';

function topicName(title) {
  return `Zalo - ${String(title || 'Unknown').slice(0, 110)}`;
}

function isAllowed(config, userId) {
  return config.allowedTelegramUserIds.size === 0 || config.allowedTelegramUserIds.has(userId);
}

function formatZaloMessage(zaloMessage) {
  const prefix = zaloMessage.isGroup ? `[${zaloMessage.senderName}]` : `[${zaloMessage.title}]`;
  const body = zaloMessage.text || zaloMessage.attachment?.title || '(non-text message)';
  return `${prefix}\n${body}`;
}

export class TelegramBridgeBot {
  constructor({ config, store, zalo, logger }) {
    this.config = config;
    this.store = store;
    this.zalo = zalo;
    this.logger = logger;
    this.bot = new Telegraf(config.telegramBotToken);
  }

  async start() {
    await ensureDir(this.config.downloadDir);
    this.registerHandlers();
    await this.bot.launch();
    this.logger.info('Telegram bot started');
  }

  stop(reason) {
    this.bot.stop(reason);
  }

  registerHandlers() {
    this.bot.command('id', async (ctx) => {
      await ctx.reply(
        [
          `chat_id: ${ctx.chat?.id}`,
          `message_thread_id: ${ctx.message?.message_thread_id || '(none)'}`,
          `from_id: ${ctx.from?.id}`,
        ].join('\n'),
      );
    });

    this.bot.command('topics', async (ctx) => {
      const mappings = this.store.listMappings();
      const text =
        mappings.length === 0
          ? 'Chưa có topic nào được map.'
          : mappings
              .map((item) => `${item.topicId} -> ${item.title} (${item.conversationId})`)
              .join('\n');
      await ctx.reply(text);
    });

    this.bot.on(message('text'), async (ctx) => {
      if (ctx.message.text.startsWith('/')) return;
      await this.forwardTelegramText(ctx);
    });

    this.bot.on(message('photo'), async (ctx) => {
      await this.forwardTelegramPhoto(ctx);
    });

    this.bot.on(message('document'), async (ctx) => {
      await this.forwardTelegramDocument(ctx);
    });

    this.bot.catch((error, ctx) => {
      this.logger.error({ error, updateType: ctx.updateType }, 'Telegram handler failed');
    });
  }

  async ensureTopicForZaloMessage(zaloMessage) {
    const existing = this.store.getByConversation(zaloMessage.conversationId);
    if (existing) {
      return this.refreshTopicTitle(existing, zaloMessage);
    }

    const topic = await this.bot.telegram.createForumTopic(
      this.config.telegramForumChatId,
      topicName(zaloMessage.title),
    );

    return this.store.upsertMapping({
      conversationId: zaloMessage.conversationId,
      threadType: zaloMessage.threadType,
      topicId: topic.message_thread_id,
      title: zaloMessage.title,
    });
  }

  async refreshTopicTitle(existing, zaloMessage) {
    const nextTitle = zaloMessage.title || existing.title;
    if (!nextTitle || nextTitle === existing.title) return existing;

    try {
      await this.bot.telegram.editForumTopic(this.config.telegramForumChatId, existing.topicId, {
        name: topicName(nextTitle),
      });
    } catch (error) {
      this.logger.warn({ error, topicId: existing.topicId }, 'Could not rename Telegram topic.');
      return existing;
    }

    return this.store.upsertMapping({
      ...existing,
      title: nextTitle,
    });
  }

  async forwardZaloMessage(zaloMessage) {
    const mapping = await this.ensureTopicForZaloMessage(zaloMessage);
    const options = { message_thread_id: mapping.topicId };

    if (zaloMessage.attachment?.url) {
      try {
        await this.bot.telegram.sendPhoto(
          this.config.telegramForumChatId,
          Input.fromURL(zaloMessage.attachment.url),
          {
            ...options,
            caption: formatZaloMessage(zaloMessage).slice(0, 1024),
          },
        );
      } catch (error) {
        this.logger.warn({ error }, 'Telegram could not fetch Zalo attachment URL; falling back to text.');
        await this.bot.telegram.sendMessage(
          this.config.telegramForumChatId,
          `${formatZaloMessage(zaloMessage)}\n${zaloMessage.attachment.url}`,
          options,
        );
      }
      return;
    }

    await this.bot.telegram.sendMessage(
      this.config.telegramForumChatId,
      formatZaloMessage(zaloMessage),
      options,
    );
  }

  async forwardTelegramText(ctx) {
    if (ctx.chat?.id !== this.config.telegramForumChatId) return;
    if (!ctx.message.message_thread_id) return;
    if (!isAllowed(this.config, ctx.from.id)) return;

    const mapping = this.store.getByTopic(ctx.message.message_thread_id);
    if (!mapping) return;

    await this.zalo.sendText({
      conversationId: mapping.conversationId,
      threadType: mapping.threadType,
      text: ctx.message.text,
    });
  }

  async forwardTelegramPhoto(ctx) {
    if (ctx.chat?.id !== this.config.telegramForumChatId) return;
    if (!ctx.message.message_thread_id) return;
    if (!isAllowed(this.config, ctx.from.id)) return;

    const mapping = this.store.getByTopic(ctx.message.message_thread_id);
    if (!mapping) return;

    const largestPhoto = ctx.message.photo.at(-1);
    const targetPath = await this.downloadTelegramFile(ctx, largestPhoto.file_id, largestPhoto.file_unique_id, 'jpg');

    await this.zalo.sendImage({
      conversationId: mapping.conversationId,
      threadType: mapping.threadType,
      filePath: targetPath,
      caption: ctx.message.caption,
    });
  }

  async forwardTelegramDocument(ctx) {
    if (ctx.chat?.id !== this.config.telegramForumChatId) return;
    if (!ctx.message.message_thread_id) return;
    if (!isAllowed(this.config, ctx.from.id)) return;
    if (!ctx.message.document.mime_type?.startsWith('image/')) return;

    const mapping = this.store.getByTopic(ctx.message.message_thread_id);
    if (!mapping) return;

    const extension = ctx.message.document.file_name?.split('.').pop() || 'jpg';
    const targetPath = await this.downloadTelegramFile(
      ctx,
      ctx.message.document.file_id,
      ctx.message.document.file_unique_id,
      extension,
    );

    await this.zalo.sendImage({
      conversationId: mapping.conversationId,
      threadType: mapping.threadType,
      filePath: targetPath,
      caption: ctx.message.caption,
    });
  }

  async downloadTelegramFile(ctx, fileId, uniqueId, fallbackExtension) {
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const extension = fileLink.pathname.split('.').pop() || fallbackExtension;
    const targetPath = uniqueDownloadPath(this.config.downloadDir, `telegram-${uniqueId}`, extension);

    const response = await fetch(fileLink);
    if (!response.ok) {
      throw new Error(`Failed to download Telegram file: ${response.status} ${response.statusText}`);
    }

    await fs.writeFile(targetPath, Buffer.from(await response.arrayBuffer()));
    return targetPath;
  }
}
