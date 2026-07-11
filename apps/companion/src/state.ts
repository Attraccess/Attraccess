import type { BrowserWindow, Tray } from 'electron';
import type { CompanionWsClient, CompanionAuthenticatedDto } from '@attraccess/companion-ws-client';
import type { StoredCredentials } from './keychain';
import type { CompanionSettings } from './settings';
import { SETTINGS_DEFAULTS } from './settings';

export const state = {
  tray: null as Tray | null,
  mainWindow: null as BrowserWindow | null,
  kioskWindow: null as BrowserWindow | null,
  wsClient: null as CompanionWsClient | null,
  creds: null as StoredCredentials | null,
  autoLogoffSeconds: 30,
  authenticatedPayload: null as CompanionAuthenticatedDto | null,
  pinHash: null as string | null,
  allowQuit: false,
  updateInProgress: false,
  kioskLocked: false,
  wsConnected: false,
  adminOverride: false,
  currentTrayState: 'disconnected' as 'locked' | 'unlocked' | 'disconnected',
  onAdminOverrideDisable: null as (() => void) | null,
  settings: { ...SETTINGS_DEFAULTS } as CompanionSettings,
};
