# Zalo-to-Tele

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
4. Fill the bot token first:

```env
TELEGRAM_BOT_TOKEN=...
```

5. Get the Telegram group id:

```bash
npm run telegram:id
```

Send `/id` in the Telegram forum group. Copy the `chat_id`, then stop the helper with `Ctrl+C`.

6. Fill the forum group id:

```env
TELEGRAM_FORUM_CHAT_ID=-100...
```

## Run

```bash
npm install
npm start
```

`npm start` opens the desktop app with:

- accounts list
- topic list
- chat panel
- live logs
- tray icon

The old console runner is still available:

```bash
npm run cli
```

To launch without a visible console window on Windows, double-click `launch-hidden.vbs`.

For first Zalo login, the app uses `auto` by default: saved cookie first, QR if no session exists. The app writes the QR to:

```text
sessions/zalo-qr.png
```

Scan it with Zalo mobile and confirm login. After a successful login, credentials are saved to `sessions/.../zalo-credentials.json`.

One bridge instance can run per account. If you add more accounts in the GUI, each one gets its own Telegram bot token and forum chat id.

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
git remote add origin https://github.com/YOUR_USER/Zalo-to-Tele.git
git branch -M main
git push -u origin main
```
