import { state } from './state';
import type { TrayState } from './tray';

// Pure state-machine — side-effects are injected so this is unit-testable
// without mocking Electron.

export function enableAdminOverride(
  unlockComputer: () => void,
  setTrayState: (s: TrayState) => void,
): void {
  state.adminOverride = true;
  console.warn('[companion] admin override enabled — server lock_pc/unlock_pc commands will be ignored until disabled');
  unlockComputer();
  setTrayState('unlocked');
}

export function disableAdminOverride(
  lockComputer: () => void,
  setTrayState: (s: TrayState) => void,
): void {
  state.adminOverride = false;
  console.warn('[companion] admin override disabled — resuming server lock state (serverLocked=%s)', state.serverLocked);
  setTrayState(state.serverLocked ? 'locked' : state.currentTrayState);
  if (state.serverLocked) lockComputer();
}

export function handleLockPc(
  lockComputer: () => void,
  setTrayState: (s: TrayState) => void,
  reloadKiosk: () => void,
): void {
  state.serverLocked = true;
  if (state.adminOverride) return;
  setTrayState('locked');
  reloadKiosk();
  lockComputer();
}

export function handleUnlockPc(
  unlockComputer: () => void,
  setTrayState: (s: TrayState) => void,
): void {
  state.serverLocked = false;
  if (state.adminOverride) return;
  setTrayState('unlocked');
  unlockComputer();
}
