import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('z2t', {
  getState: () => ipcRenderer.invoke('app:getState'),
  addAccount: (input) => ipcRenderer.invoke('app:addAccount', input),
  updateAccount: (id, patch) => ipcRenderer.invoke('app:updateAccount', id, patch),
  removeAccount: (id) => ipcRenderer.invoke('app:removeAccount', id),
  startAccount: (id) => ipcRenderer.invoke('app:startAccount', id),
  stopAccount: (id) => ipcRenderer.invoke('app:stopAccount', id),
  startAll: () => ipcRenderer.invoke('app:startAll'),
  stopAll: () => ipcRenderer.invoke('app:stopAll'),
  selectAccount: (id) => ipcRenderer.invoke('app:selectAccount', id),
  selectConversation: (id) => ipcRenderer.invoke('app:selectConversation', id),
  sendMessage: (payload) => ipcRenderer.invoke('app:sendMessage', payload),
  sendImage: (payload) => ipcRenderer.invoke('app:sendImage', payload),
  pickImage: () => ipcRenderer.invoke('app:pickImage'),
  onState: (callback) => ipcRenderer.on('state-updated', (_, state) => callback(state)),
  onLog: (callback) => ipcRenderer.on('log-entry', (_, entry) => callback(entry)),
  onTranscript: (callback) => ipcRenderer.on('transcript-entry', (_, entry) => callback(entry)),
});
