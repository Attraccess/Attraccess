import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NetworkRestrictedAction } from '@attraccess/application-models';
import { NetworkRestrictedHint } from './NetworkRestrictedHint';

const state = vi.hoisted(() => ({ restricted: new Set<string>() }));

vi.mock('../../hooks/useNetworkRestriction', () => ({
  useNetworkRestriction: () => ({ isRestricted: (action: string) => state.restricted.has(action) }),
}));

describe('NetworkRestrictedHint', () => {
  it('says why a control is disabled when the action is restricted', () => {
    state.restricted = new Set([NetworkRestrictedAction.DoorLock]);
    render(<NetworkRestrictedHint actions={[NetworkRestrictedAction.DoorOpen, NetworkRestrictedAction.DoorLock]} />);
    expect(screen.getByRole('note')).toHaveTextContent('Only available from the local network.');
  });

  it('renders nothing when every listed action is allowed', () => {
    state.restricted = new Set();
    render(<NetworkRestrictedHint actions={NetworkRestrictedAction.UsageEnd} />);
    expect(screen.queryByRole('note')).toBeNull();
  });
});
