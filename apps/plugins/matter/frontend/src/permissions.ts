// What the signed-in user may do on the Matter page. The host pushes the auth state, including the effective
// permission keys, through `onApiAuthStateChange`; the page reads it here to hide the controls (and skip the requests)
// the API would refuse with 403. The API enforces every key on its own.
import { hasPluginAuthPermission, type AttraccessFrontendPluginAuthData } from '@attraccess/plugins-frontend-sdk';
import { useSyncExternalStore } from 'react';
import {
  MATTER_DEVICES_COMMAND_DIRECT,
  MATTER_DEVICES_COMMISSION,
  MATTER_DEVICES_MANAGE,
  MATTER_DEVICES_READ,
  THREAD_NETWORK_MANAGE,
  THREAD_NETWORK_READ,
} from '../../backend/permission-keys';

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
  /** Status views and the device list and detail: `matter.devices.read`. */
  canRead: boolean;
  /**
   * Settings, fabric creation, recovery key, backups (incl. download), restore, lifecycle actions and name edits.
   * Only together with `canRead`: the manage controls sit in the read views, so `matter.devices.manage` alone shows
   * nothing.
   */
  canManage: boolean;
  /** The Commissioning tab: `matter.devices.commission`. */
  canCommission: boolean;
  /** Direct commands from the admin UI (`matter.devices.command-direct`). No such UI exists yet. */
  canCommandDirect: boolean;
  /** The Thread network views: `thread.network.read`. */
  canReadThread: boolean;
  /** Thread manage actions (`thread.network.manage`), with `canReadThread`. None exist yet. */
  canManageThread: boolean;
}

export function useMatterPermissions(): MatterPermissions {
  const current = useSyncExternalStore(subscribe, () => authData);
  const has = (key: string) => hasPluginAuthPermission(current, key);
  const canRead = has(MATTER_DEVICES_READ);
  const canReadThread = has(THREAD_NETWORK_READ);
  return {
    known: current !== null,
    canRead,
    canManage: canRead && has(MATTER_DEVICES_MANAGE),
    canCommission: has(MATTER_DEVICES_COMMISSION),
    canCommandDirect: has(MATTER_DEVICES_COMMAND_DIRECT),
    canReadThread,
    canManageThread: canReadThread && has(THREAD_NETWORK_MANAGE),
  };
}
