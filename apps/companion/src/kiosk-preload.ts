import { contextBridge, ipcRenderer } from 'electron';

// Injected into the kiosk BrowserWindow so the React frontend can report
// idle-warning state and receive dismiss signals from the tray.
contextBridge.exposeInMainWorld('companionKiosk', {
  reportIdleWarning: (isWarning: boolean) => ipcRenderer.send('kiosk-idle-warning', isWarning),

  // Returns a cleanup function; call it to unregister the listener.
  onDismissIdle: (cb: () => void): (() => void) => {
    const listener = () => cb();
    ipcRenderer.on('kiosk-dismiss-idle', listener);
    return () => ipcRenderer.removeListener('kiosk-dismiss-idle', listener);
  },
});
