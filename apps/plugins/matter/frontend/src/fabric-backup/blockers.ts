import type { FabricBackupStatus } from './api';

/** Why an action the status disallows is disabled; a `fabric.blocked.*` key suffix. */
export type Blocker = 'unreachable' | 'recovery' | 'noFabric' | 'noKey' | 'insecure';

/**
 * Why "Back up now" is disabled. The backend allows it for a reachable, initialized fabric outside recovery with a
 * recovery key over a secure connection; the status does not carry the transport, so that is what remains.
 */
export function backupBlocker({ actions, sidecar, recovery, recoveryKey }: FabricBackupStatus): Blocker | null {
  if (actions.canBackup) return null;
  if (!sidecar.reachable) return 'unreachable';
  if (recovery.required) return 'recovery';
  if (sidecar.state !== 'initialized') return 'noFabric';
  return recoveryKey.present ? 'insecure' : 'noKey';
}

/** Why "Restore from backup" is disabled: the backend allows it whenever the sidecar is reachable over a secure link. */
export function restoreBlocker({ actions, sidecar }: FabricBackupStatus): Blocker | null {
  if (actions.canRestore) return null;
  return sidecar.reachable ? 'insecure' : 'unreachable';
}
