// What the signed-in user may do on the Matter page. The host pushes the auth state, including the effective
// permission keys, through `onApiAuthStateChange`; the page reads it here to hide the controls (and skip the requests)
// the API would refuse with 403. The API enforces every key on its own.
import { hasPluginAuthPermission, type AttraccessFrontendPluginAuthData } from '@attraccess/plugins-frontend-sdk';
import { useSyncExternalStore } from 'react';
import { MATTER_DEVICES_MANAGE, MATTER_DEVICES_READ } from '../../backend/permission-keys';

let authData: AttraccessFrontendPluginAuthData | null = null;
const listeners = new Set<() => void>();

export function setMatterAuthData(next: AttraccessFrontendPluginAuthData | null): void {
  authData = next;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export interface MatterPermissions {
  /** Whether the host has pushed the auth state yet. Until then nothing is known, not "no permissions". */
  known: boolean;
  /** Status views: connection, fabric and backup status. */
  canRead: boolean;
  /**
   * Settings, fabric creation, recovery key, backups (incl. download) and restore. Only together with `canRead`:
   * the manage controls sit in the status views, so `matter.devices.manage` alone shows nothing.
   */
  canManage: boolean;
}

export function useMatterPermissions(): MatterPermissions {
  const current = useSyncExternalStore(subscribe, () => authData);
  const canRead = hasPluginAuthPermission(current, MATTER_DEVICES_READ);
  return {
    known: current !== null,
    canRead,
    canManage: canRead && hasPluginAuthPermission(current, MATTER_DEVICES_MANAGE),
  };
}
