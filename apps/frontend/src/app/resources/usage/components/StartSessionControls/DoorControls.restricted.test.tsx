import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NetworkRestrictedAction } from '@attraccess/application-models';
import { DoorControls } from './DoorControls';

const state = vi.hoisted(() => ({ restricted: new Set<string>() }));

vi.mock('../../../../../hooks/useNetworkRestriction', () => ({
  useNetworkRestriction: () => ({ isRestricted: (action: string) => state.restricted.has(action) }),
}));

const pending = { lockIsPending: false, unlockIsPending: false, unlatchIsPending: false, openIsPending: false };
const handlers = { onLock: vi.fn(), onUnlock: vi.fn(), onUnlatch: vi.fn(), onOpen: vi.fn() };

describe('DoorControls outside the allowed network', () => {
  it('keeps the buttons of restricted actions visible but disabled, and explains why', () => {
    state.restricted = new Set([NetworkRestrictedAction.DoorUnlock, NetworkRestrictedAction.DoorUnlatch]);
    render(<DoorControls {...handlers} {...pending} separateUnlockAndUnlatch />);
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Unlatch' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lock' })).toBeEnabled();
    expect(screen.getByRole('note')).toHaveTextContent('Only available from the local network.');
  });

  it('disables Open on an access-only door', () => {
    state.restricted = new Set([NetworkRestrictedAction.DoorOpen]);
    render(<DoorControls {...handlers} {...pending} accessOnly />);
    expect(screen.getByRole('button', { name: 'Open' })).toBeDisabled();
    expect(screen.getByRole('note')).toBeInTheDocument();
  });

  it('does not explain an Unlatch button that is not shown', () => {
    state.restricted = new Set([NetworkRestrictedAction.DoorUnlatch]);
    render(<DoorControls {...handlers} {...pending} />);
    expect(screen.queryByRole('button', { name: 'Unlatch' })).toBeNull();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('shows no hint and enabled buttons while nothing is restricted', () => {
    state.restricted = new Set();
    render(<DoorControls {...handlers} {...pending} />);
    expect(screen.getByRole('button', { name: 'Lock' })).toBeEnabled();
    expect(screen.queryByRole('note')).toBeNull();
  });
});
