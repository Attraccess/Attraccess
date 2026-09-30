// jest.mock is hoisted before imports — keep it here.
/* eslint-disable import/first */
jest.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));

import { state } from './state';
import { enableAdminOverride, disableAdminOverride, handleLockPc, handleUnlockPc } from './admin-override';
import { hashPin } from './pin';
/* eslint-enable import/first */

function makeOps() {
  return {
    unlock: jest.fn(),
    lock: jest.fn(),
    tray: jest.fn(),
    reload: jest.fn(),
  };
}

function resetState() {
  state.adminOverride = false;
  state.serverLocked = false;
  state.currentTrayState = 'unlocked';
  state.pinHash = null;
}

beforeEach(resetState);

// ─── enableAdminOverride ──────────────────────────────────────────────────────

describe('enableAdminOverride', () => {
  it('sets adminOverride and calls unlock + tray', () => {
    const { unlock, tray } = makeOps();
    enableAdminOverride(unlock, tray);
    expect(state.adminOverride).toBe(true);
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(tray).toHaveBeenCalledWith('unlocked');
  });
});

// ─── disableAdminOverride ─────────────────────────────────────────────────────

describe('disableAdminOverride', () => {
  it('clears adminOverride', () => {
    state.adminOverride = true;
    const { lock, tray, reload } = makeOps();
    disableAdminOverride(lock, tray, reload);
    expect(state.adminOverride).toBe(false);
  });

  it('re-locks when serverLocked is true and reloads kiosk first', () => {
    state.adminOverride = true;
    state.serverLocked = true;
    const { lock, tray, reload } = makeOps();
    const callOrder: string[] = [];
    reload.mockImplementation(() => callOrder.push('reload'));
    lock.mockImplementation(() => callOrder.push('lock'));
    disableAdminOverride(lock, tray, reload);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(lock).toHaveBeenCalledTimes(1);
    expect(tray).toHaveBeenCalledWith('locked');
    expect(callOrder).toEqual(['reload', 'lock']);
  });

  it('does NOT lock or reload when serverLocked is false', () => {
    state.adminOverride = true;
    state.serverLocked = false;
    const { lock, tray, reload } = makeOps();
    disableAdminOverride(lock, tray, reload);
    expect(lock).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('re-applies the *current* serverLocked state, not the stale authenticated payload', () => {
    // Simulates: authenticated with locked=false, then server sent lock_pc while
    // override was active (so serverLocked became true), then admin disables override.
    state.adminOverride = true;
    state.serverLocked = true; // updated by handleLockPc while override was active
    const { lock, tray, reload } = makeOps();
    disableAdminOverride(lock, tray, reload);
    // Must lock — even though "authenticatedPayload.locked" would have been false
    expect(reload).toHaveBeenCalled();
    expect(lock).toHaveBeenCalled();
    expect(tray).toHaveBeenCalledWith('locked');
  });
});

// ─── handleLockPc ─────────────────────────────────────────────────────────────

describe('handleLockPc', () => {
  it('always updates serverLocked to true', () => {
    state.adminOverride = true;
    const { lock, tray, reload } = makeOps();
    handleLockPc(lock, tray, reload);
    expect(state.serverLocked).toBe(true);
  });

  it('suppresses lock/tray/reload while adminOverride is active', () => {
    state.adminOverride = true;
    const { lock, tray, reload } = makeOps();
    handleLockPc(lock, tray, reload);
    expect(lock).not.toHaveBeenCalled();
    expect(tray).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('locks and updates tray when override is NOT active', () => {
    state.adminOverride = false;
    const { lock, tray, reload } = makeOps();
    handleLockPc(lock, tray, reload);
    expect(lock).toHaveBeenCalledTimes(1);
    expect(tray).toHaveBeenCalledWith('locked');
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

// ─── handleUnlockPc ───────────────────────────────────────────────────────────

describe('handleUnlockPc', () => {
  it('always updates serverLocked to false', () => {
    state.serverLocked = true;
    state.adminOverride = true;
    const { unlock, tray } = makeOps();
    handleUnlockPc(unlock, tray);
    expect(state.serverLocked).toBe(false);
  });

  it('suppresses unlock/tray while adminOverride is active', () => {
    state.adminOverride = true;
    const { unlock, tray } = makeOps();
    handleUnlockPc(unlock, tray);
    expect(unlock).not.toHaveBeenCalled();
    expect(tray).not.toHaveBeenCalled();
  });

  it('unlocks and updates tray when override is NOT active', () => {
    state.adminOverride = false;
    const { unlock, tray } = makeOps();
    handleUnlockPc(unlock, tray);
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(tray).toHaveBeenCalledWith('unlocked');
  });
});

// ─── disconnect reset ─────────────────────────────────────────────────────────
// The disconnect handler in main.ts resets state.adminOverride — verify the
// state field is present and writable (guards against accidental type narrowing).

describe('state.adminOverride reset on disconnect', () => {
  it('can be set to false after being true', () => {
    state.adminOverride = true;
    state.adminOverride = false;
    expect(state.adminOverride).toBe(false);
  });
});

// ─── PIN gate (verifyPinHash integration) ────────────────────────────────────

describe('PIN gate', () => {
  it('verifyPinHash returns false for wrong PIN — IPC handler would reject', () => {
    const { verifyPinHash } = jest.requireActual<typeof import('./pin')>('./pin');
    state.pinHash = hashPin('correct');
    expect(verifyPinHash('wrong', state.pinHash)).toBe(false);
    expect(verifyPinHash('correct', state.pinHash)).toBe(true);
  });
});
