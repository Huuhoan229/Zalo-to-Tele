# ChatTeleZola

Bridge Telegram <-> Zalo personal account, using one Telegram forum topic per Zalo conversation.

> Zalo personal account support uses `zca-js`, an unofficial Zalo Web API. It can break when Zalo changes Web behavior and may trigger account/session restrictions. Use a secondary account if possible.

## What It Does

- Creates/uses one Telegram forum topic for each Zalo private chat or Zalo group.
- Forwards Zalo text messages into the matching Telegram topic.
- Forwards Telegram text replies in that topic back to the matching Zalo conversation.
- Forwards Telegram photos/image documents to Zalo.
- Tries to forward Zalo image attachments to Telegram photos, with text fallback when Telegram cannot fetch the Zalo URL.
- Stores the mapping in `data/store.json`.

## Setup

1. Create a Telegram bot with BotFather and copy the token.
2. Create a Telegram group, enable **Topics** in group settings, and add the bot as admin.
3. Copy `.env.example` to `.env`.
4. Fill:

```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_FORUM_CHAT_ID=-100...
```

To get the group id, add the bot to the group and send `/id` in the group.

## Run

```bash
npm install
npm start
```

For first Zalo login, keep `ZALO_LOGIN_MODE=qr`. The app writes the QR to:

```text
sessions/zalo-qr.png
```

Scan it with Zalo mobile and confirm login. After a successful login, credentials are saved to `sessions/zalo-credentials.json`; later you can switch to:

```env
ZALO_LOGIN_MODE=cookie
```

Only one Zalo Web listener can run per account at the same time.

## Telegram Usage

- `/id` shows the current Telegram chat/thread identifiers.
- `/topics` lists known Zalo <-> Telegram topic mappings.
- Send text or a photo inside a mapped topic to send it to Zalo.

When a new Zalo conversation sends a message, the bot creates a Telegram topic automatically:

```text
Zalo - Customer Name
```

For Zalo group chats, all members stay in the same topic and the sender name is shown in each forwarded message.

## GitHub

If you already have a GitHub remote:

```bash
git remote add origin https://github.com/YOUR_USER/ChatTeleZola.git
git branch -M main
git push -u origin main
```
