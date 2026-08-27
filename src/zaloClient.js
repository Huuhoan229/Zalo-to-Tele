import fs from 'node:fs/promises';
import path from 'node:path';
import { LoginQRCallbackEventType, Zalo, ThreadType } from 'zca-js';
import { imageMetadataGetter } from './media.js';

function pickText(content) {
  if (typeof content === 'string') return content;
  if (!content || typeof content !== 'object') return '';
  return content.title || content.href || content.description || content.text || '';
}

function pickSenderName(message) {
  return (
    message.data?.dName ||
    message.data?.senderName ||
    message.data?.fromDName ||
    message.senderName ||
    message.fromDisplayName ||
    message.uidFrom ||
    'Zalo'
  );
}

function pickConversationTitle(message, isGroup) {
  if (isGroup) {
    return (
      message.data?.threadName ||
      message.data?.groupName ||
      message.data?.groupTitle ||
      message.threadName ||
      message.groupName ||
      message.title ||
      `Zalo group ${message.threadId}`
    );
  }

  return (
    message.data?.dName ||
    message.data?.threadName ||
    message.data?.displayName ||
    message.threadName ||
    message.title ||
    `Zalo user ${message.threadId}`
  );
}

function normalizeAttachment(content) {
  if (!content || typeof content !== 'object') return null;
  const href = content.href || content.thumb || content.previewUrl || content.url;
  if (!href) return null;
  return {
    url: href,
    title: content.title || content.fileName || 'attachment',
    raw: content,
  };
}

export class ZaloClient {
  constructor({ credentialsFile, loginMode, selfListen = true, logger }) {
    this.credentialsFile = credentialsFile;
    this.loginMode = loginMode;
    this.selfListen = selfListen;
    this.logger = logger;
    this.api = null;
    this.ThreadType = ThreadType;
  }

  async connect() {
    const zalo = new Zalo({
      imageMetadataGetter,
      selfListen: this.selfListen,
    });

    if (this.loginMode === 'cookie' || this.loginMode === 'auto') {
      try {
        const raw = await fs.readFile(this.credentialsFile, 'utf8');
        const credentials = JSON.parse(raw);
        this.api = await zalo.login(credentials);
        this.logger.info({ credentialsFile: this.credentialsFile }, 'Logged into Zalo with saved credentials.');
      } catch (error) {
        if (this.loginMode === 'cookie') throw error;
        this.logger.warn({ error }, 'Saved Zalo credentials unavailable; falling back to QR login.');
      }
    }

    if (!this.api) {
      await this.loginWithQr(zalo);
    }

    this.logger.info('Connected to Zalo');
    return this;
  }

  async loginWithQr(zalo) {
    await fs.mkdir(path.dirname(this.credentialsFile), { recursive: true });
    const qrPath = path.join(path.dirname(this.credentialsFile), 'zalo-qr.png');
    this.api = await zalo.loginQR({ qrPath }, async (event) => {
      if (event.type === LoginQRCallbackEventType.QRCodeGenerated) {
        await event.actions.saveToFile(qrPath);
        this.logger.info({ qrPath }, 'Zalo QR generated. Open this file and scan it with Zalo mobile.');
      }

      if (event.type === LoginQRCallbackEventType.QRCodeScanned) {
        this.logger.info({ account: event.data.display_name }, 'Zalo QR scanned. Confirm login on mobile.');
      }

      if (event.type === LoginQRCallbackEventType.GotLoginInfo) {
        await fs.writeFile(
          this.credentialsFile,
          `${JSON.stringify(
            {
              cookie: event.data.cookie,
              imei: event.data.imei,
              userAgent: event.data.userAgent,
            },
            null,
            2,
          )}\n`,
          'utf8',
        );
        this.logger.info({ credentialsFile: this.credentialsFile }, 'Zalo credentials saved.');
      }
    });
  }

  onMessage(handler) {
    if (!this.api) throw new Error('Zalo is not connected');

    this.api.listener.on('message', async (message) => {
      try {
        await handler(await this.normalizeMessage(message));
      } catch (error) {
        this.logger.error({ error, message }, 'Failed to handle Zalo message');
      }
    });

    this.api.listener.start();
  }

  stop() {
    this.api?.listener?.stop?.();
  }

  async normalizeMessage(message) {
    const content = message.data?.content;
    const attachment = normalizeAttachment(content);
    const isGroup = message.type === ThreadType.Group;

    return {
      id: message.data?.msgId || message.messageId || `${message.threadId}-${Date.now()}`,
      conversationId: String(message.threadId),
      threadType: message.type,
      isGroup,
      isSelf: Boolean(message.isSelf),
      senderName: pickSenderName(message),
      title: await this.resolveConversationTitle(message, isGroup),
      text: pickText(content),
      attachment,
      raw: message,
    };
  }

  async resolveConversationTitle(message, isGroup) {
    if (!isGroup) return pickConversationTitle(message, false);

    try {
      const response = await this.api.getGroupInfo(String(message.threadId));
      const group = response?.gridInfoMap?.[String(message.threadId)];
      if (group?.name) return group.name;
    } catch (error) {
      this.logger.warn({ error, threadId: message.threadId }, 'Could not fetch Zalo group name; using message fallback.');
    }

    return pickConversationTitle(message, true);
  }

  async sendText({ conversationId, threadType, text }) {
    if (!this.api) throw new Error('Zalo is not connected');
    await this.api.sendMessage({ msg: text }, conversationId, threadType);
  }

  async sendImage({ conversationId, threadType, filePath, caption }) {
    if (!this.api) throw new Error('Zalo is not connected');
    const payload = {
      attachments: [path.resolve(filePath)],
    };
    if (caption) payload.msg = caption;
    await this.api.sendMessage(payload, conversationId, threadType);
  }
}
