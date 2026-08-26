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

function pickConversationTitle(message) {
  return (
    message.data?.threadName ||
    message.data?.groupName ||
    message.data?.dName ||
    message.threadName ||
    message.title ||
    `Zalo ${message.threadId}`
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
  constructor({ credentialsFile, loginMode, logger }) {
    this.credentialsFile = credentialsFile;
    this.loginMode = loginMode;
    this.logger = logger;
    this.api = null;
    this.ThreadType = ThreadType;
  }

  async connect() {
    const zalo = new Zalo({ imageMetadataGetter });

    if (this.loginMode === 'cookie') {
      const raw = await fs.readFile(this.credentialsFile, 'utf8');
      const credentials = JSON.parse(raw);
      this.api = await zalo.login(credentials);
    } else {
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

    this.logger.info('Connected to Zalo');
    return this;
  }

  onMessage(handler) {
    if (!this.api) throw new Error('Zalo is not connected');

    this.api.listener.on('message', async (message) => {
      try {
        if (message.isSelf) return;
        await handler(this.normalizeMessage(message));
      } catch (error) {
        this.logger.error({ error, message }, 'Failed to handle Zalo message');
      }
    });

    this.api.listener.start();
  }

  normalizeMessage(message) {
    const content = message.data?.content;
    const attachment = normalizeAttachment(content);
    return {
      id: message.data?.msgId || message.messageId || `${message.threadId}-${Date.now()}`,
      conversationId: String(message.threadId),
      threadType: message.type,
      isGroup: message.type === ThreadType.Group,
      senderName: pickSenderName(message),
      title: pickConversationTitle(message),
      text: pickText(content),
      attachment,
      raw: message,
    };
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
