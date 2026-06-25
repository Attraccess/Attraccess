import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('companion', {
  checkHealth: (serverUrl: string) => ipcRenderer.invoke('check-health', serverUrl),
  register: (serverUrl: string) => ipcRenderer.invoke('register', serverUrl),
  setAutoLogoff: (seconds: number) => ipcRenderer.invoke('set-auto-logoff', seconds),
  getPermissions: () => ipcRenderer.invoke('get-permissions'),
  requestPermission: (name: string) => ipcRenderer.invoke('request-permission', name),
  isPinSet: () => ipcRenderer.invoke('is-pin-set'),
  savePin: (pin: string) => ipcRenderer.invoke('save-pin', pin),
  verifyPin: (pin: string) => ipcRenderer.invoke('verify-pin', pin),
  confirmQuit: () => ipcRenderer.invoke('confirm-quit'),
  disconnect: () => ipcRenderer.invoke('disconnect'),

  onInit: (cb: (data: { firstRun: boolean; serverUrl?: string }) => void) =>
    ipcRenderer.on('init', (_e, data) => cb(data)),
  onWsStatus: (cb: (status: 'connected' | 'disconnected') => void) =>
    ipcRenderer.on('ws-status', (_e, status) => cb(status)),
  onRegistered: (cb: (data: { id: number }) => void) =>
    ipcRenderer.on('registered', (_e, data) => cb(data)),
  onAuthenticated: (cb: (data: unknown) => void) =>
    ipcRenderer.on('authenticated', (_e, data) => cb(data)),
});
