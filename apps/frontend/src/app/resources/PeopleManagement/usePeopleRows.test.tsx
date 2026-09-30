import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePeopleRows } from './usePeopleRows';
const state = vi.hoisted(() => ({
  resourceIntroducers: {} as Record<string, unknown>,
  resourceIntroductions: {} as Record<string, unknown>,
  groupIntroducers: {} as Record<string, unknown>,
  groupIntroductions: {} as Record<string, unknown>,
  calls: vi.fn(),
}));
vi.mock('@attraccess/react-query-client', () => ({
  ResourceIntroducerType: { INTRODUCER: 'introducer', MAINTAINER: 'maintainer' },
  useAccessControlServiceResourceIntroducersGetMany: (...args: unknown[]) => {
    state.calls('resourceIntroducers', ...args);
    return state.resourceIntroducers;
  },
  useAccessControlServiceResourceIntroductionsGetMany: (...args: unknown[]) => {
    state.calls('resourceIntroductions', ...args);
    return state.resourceIntroductions;
  },
  useAccessControlServiceResourceGroupIntroducersGetMany: (...args: unknown[]) => {
    state.calls('groupIntroducers', ...args);
    return state.groupIntroducers;
  },
  useAccessControlServiceResourceGroupIntroductionsGetMany: (...args: unknown[]) => {
    state.calls('groupIntroductions', ...args);
    return state.groupIntroductions;
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.resourceIntroducers = {};
  state.resourceIntroductions = {};
  state.groupIntroducers = {};
  state.groupIntroductions = {};
});
afterEach(cleanup);
it('merges a person’s roles and introduction while sorting by latest activity', () => {
  const user = { id: 1, username: 'Alex' };
  state.resourceIntroducers = {
    data: [
      { user, type: 'introducer', grantedAt: '2024-01-01' },
      { user, type: 'maintainer', grantedAt: '2024-02-01' },
      { user: null, type: 'maintainer', grantedAt: '2024-06-01' },
    ],
  };
  state.resourceIntroductions = {
    data: [
      {
        receiverUser: user,
        receiverUserId: 1,
        createdAt: '2024-01-01',
        history: [
          { action: 'revoke', createdAt: '2024-01-02' },
          { action: 'grant', createdAt: '2024-03-01' },
        ],
      },
      { receiverUser: { id: 2 }, receiverUserId: 2, createdAt: '2024-04-01', history: [] },
      { receiverUser: null, createdAt: '2024-05-01' },
    ],
  };
  const { result } = renderHook(() => usePeopleRows({ target: { type: 'resource', id: 8 } }));
  expect(result.current.rows.map((row) => row.user.id)).toEqual([2, 1]);
  expect(result.current.rows[1]).toMatchObject({
    isIntroducer: true,
    isMaintainer: true,
    hasValidIntroduction: true,
    activityAt: '2024-03-01',
    introductionLastEventAt: '2024-03-01',
  });
  expect(result.current.rows[1].introducers).toHaveLength(2);
  expect(result.current.rows[0]).toMatchObject({
    isIntroducer: false,
    hasValidIntroduction: false,
    activityAt: '2024-04-01',
  });
  expect(state.calls).toHaveBeenCalledWith('resourceIntroductions', { resourceId: 8 }, undefined, { enabled: true });
  expect(state.calls).toHaveBeenCalledWith('groupIntroductions', { groupId: 8 }, undefined, { enabled: false });
});
it('uses group data and status independently of inactive resource query errors', () => {
  state.resourceIntroducers = { error: new Error('inactive'), isLoading: true };
  state.groupIntroducers = { data: [{ user: { id: 3 }, type: 'maintainer', grantedAt: '2024-05-01' }] };
  state.groupIntroductions = {
    data: [{ receiverUser: { id: 3 }, receiverUserId: 3, createdAt: '2024-01-01' }],
    isLoading: false,
  };
  const { result, rerender } = renderHook(() => usePeopleRows({ target: { type: 'group', id: 9 } }));
  expect(result.current).toMatchObject({ isLoading: false, hasError: false });
  expect(result.current.rows[0]).toMatchObject({
    activityAt: '2024-05-01',
    isMaintainer: true,
    isIntroducer: false,
    hasValidIntroduction: false,
  });
  state.groupIntroductions = { error: new Error('group unavailable'), isLoading: true };
  rerender();
  expect(result.current).toMatchObject({ isLoading: true, hasError: true });
});
it('returns an empty list while the active queries load', () => {
  state.resourceIntroducers = { isLoading: true };
  const { result } = renderHook(() => usePeopleRows({ target: { type: 'resource', id: 8 } }));
  expect(result.current).toEqual({ rows: [], isLoading: true, hasError: false });
});
