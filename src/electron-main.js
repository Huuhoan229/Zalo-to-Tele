import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, dialog } from 'electron';
import { BridgeManager } from './bridgeManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow = null;
let tray = null;
let quitting = false;
const manager = new BridgeManager({
  baseDir: process.cwd(),
  consoleOutput: false,
});

function createTrayIcon() {
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill="#11151b"/>
      <path d="M16 20h18c6 0 10 4 10 9 0 4-2 7-5 8l7 7H37l-6-6H26v6H16V20zm10 13h7c2 0 4-1 4-4s-2-4-4-4h-7v8z" fill="#8cc8b5"/>
    </svg>
  `).toString('base64');
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${svg}`);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1280,
    minHeight: 820,
    backgroundColor: '#0f1418',
    title: 'Zalo-to-Tele',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  await mainWindow.loadFile(path.join(__dirname, 'electron.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function setupTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('Zalo-to-Tele');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Show',
        click: () => mainWindow?.show(),
      },
      {
        label: 'Hide',
        click: () => mainWindow?.hide(),
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: async () => {
          quitting = true;
          await manager.stopAll();
          app.quit();
        },
      },
    ]),
  );

  tray.on('double-click', () => mainWindow?.show());
}

function wireManager() {
  const pushState = () => {
    const state = manager.getState();
    if (mainWindow?.webContents) {
      mainWindow.webContents.send('state-updated', state);
    }
  };

  manager.on('log', (entry) => {
    mainWindow?.webContents?.send('log-entry', entry);
  });

  manager.on('state', pushState);
  manager.on('transcript', (event) => {
    mainWindow?.webContents?.send('transcript-entry', event);
  });

  ipcMain.handle('app:getState', async () => manager.getState());
  ipcMain.handle('app:addAccount', async (_, input) => {
    const account = await manager.addAccount(input);
    pushState();
    return account;
  });
  ipcMain.handle('app:updateAccount', async (_, id, patch) => {
    const account = await manager.updateAccount(id, patch);
    pushState();
    return account;
  });
  ipcMain.handle('app:removeAccount', async (_, id) => {
    await manager.removeAccount(id);
    pushState();
  });
  ipcMain.handle('app:startAccount', async (_, id) => {
    const snapshot = await manager.startAccount(id);
    pushState();
    return snapshot;
  });
  ipcMain.handle('app:stopAccount', async (_, id) => {
    await manager.stopAccount(id);
    pushState();
  });
  ipcMain.handle('app:startAll', async () => {
    await manager.startAll();
    pushState();
  });
  ipcMain.handle('app:stopAll', async () => {
    await manager.stopAll();
    pushState();
  });
  ipcMain.handle('app:selectAccount', async (_, id) => {
    await manager.selectAccount(id);
    pushState();
  });
  ipcMain.handle('app:selectConversation', async (_, id) => {
    await manager.selectConversation(id);
    pushState();
  });
  ipcMain.handle('app:sendMessage', async (_, payload) => {
    return manager.sendMessage(payload.accountId, payload.conversationId, payload.text);
  });
  ipcMain.handle('app:sendImage', async (_, payload) => {
    return manager.sendImage(payload.accountId, payload.conversationId, payload.filePath, payload.caption);
  });
  ipcMain.handle('app:pickImage', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}

app.whenReady().then(async () => {
  try {
    await manager.load();
    wireManager();
    await createWindow();
    setupTray();
    await manager.startAll();
    if (mainWindow?.webContents) {
      mainWindow.webContents.send('state-updated', manager.getState());
    }
  } catch (error) {
    manager.rootLogger?.error?.({ error }, 'Desktop app boot failed');
  }
});

app.on('window-all-closed', () => {});

app.on('before-quit', async (event) => {
  if (!quitting) {
    event.preventDefault();
    quitting = true;
    await manager.stopAll();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow?.show();
  }
});
