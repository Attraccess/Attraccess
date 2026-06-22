import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('companion', {
  version: process.versions.electron,
});
