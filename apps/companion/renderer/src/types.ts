export type Step = 'loading' | 'permissions' | 'pin-setup' | 'pin-entry' | 'url' | 'register' | 'done';

export interface Permissions {
  needed: boolean;
  accessibility: boolean;
}

export interface CompanionBridge {
  checkHealth: (url: string) => Promise<boolean>;
  register: (url: string) => Promise<void>;
  getPermissions: () => Promise<Permissions>;
  requestPermission: (name: 'accessibility') => Promise<Permissions>;
  isPinSet: () => Promise<boolean>;
  savePin: (pin: string) => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  confirmQuit: () => Promise<void>;
  disconnect: () => Promise<void>;
  onInit: (cb: (data: { firstRun: boolean; serverUrl?: string; requirePin?: 'settings' | 'quit'; registered: boolean; connected: boolean }) => void) => void;
  onWsStatus: (cb: (status: 'connected' | 'disconnected') => void) => void;
  onRegistered: (cb: (data: { id: number }) => void) => void;
  onAuthenticated: (cb: (data: unknown) => void) => void;
}

declare global {
  interface Window {
    companion: CompanionBridge;
  }
}
