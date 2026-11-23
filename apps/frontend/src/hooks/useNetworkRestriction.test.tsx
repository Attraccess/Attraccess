import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkRestrictedAction } from '@attraccess/application-models';
import { useNetworkRestriction } from './useNetworkRestriction';

const state = vi.hoisted(() => ({ data: undefined as unknown }));

vi.mock('@attraccess/react-query-client', () => ({
  useGetNetworkRestrictionStatus: () => ({ data: state.data }),
}));

describe('useNetworkRestriction', () => {
  beforeEach(() => {
    state.data = undefined;
  });

  it('restricts nothing until the answer is there', () => {
    const { result } = renderHook(() => useNetworkRestriction());
    expect(result.current.isRestricted(NetworkRestrictedAction.UsageStart)).toBe(false);
  });

  it('restricts nothing while the restriction is off', () => {
    state.data = { enabled: false, insideAllowedNetwork: true, allowedFromHere: [] };
    const { result } = renderHook(() => useNetworkRestriction());
    expect(result.current.isRestricted(NetworkRestrictedAction.DoorUnlock)).toBe(false);
  });

  it('restricts the actions the user may not do from here', () => {
    state.data = { enabled: true, insideAllowedNetwork: false, allowedFromHere: ['usage.start'] };
    const { result } = renderHook(() => useNetworkRestriction());
    expect(result.current.isRestricted(NetworkRestrictedAction.UsageStart)).toBe(false);
    expect(result.current.isRestricted(NetworkRestrictedAction.UsageTakeover)).toBe(true);
    expect(result.current.isRestricted(NetworkRestrictedAction.SupervisionApprove)).toBe(true);
  });
});
