import { createContext, useContext } from 'react';
import type { ConnectionSettings, ConnectionStatus, SettingsInput } from './api';

/** The connection state the layout loads once and every tab reads: one poll, not one per tab. */
export interface MatterConnectionValue {
  status: ConnectionStatus | null;
  statusError: string | null;
  settings: ConnectionSettings | null;
  settingsError: string | null;
  /** True until the first status answer. */
  loading: boolean;
  save: (input: SettingsInput) => Promise<ConnectionSettings>;
  remove: () => Promise<void>;
  /** Reconnects to the sidecar at once (`canManage`). */
  retryNow: () => Promise<void>;
}

const MatterConnectionContext = createContext<MatterConnectionValue | null>(null);

export const MatterConnectionProvider = MatterConnectionContext.Provider;

export function useMatterConnection(): MatterConnectionValue {
  const value = useContext(MatterConnectionContext);
  if (!value) throw new Error('useMatterConnection needs the Matter page.');
  return value;
}
