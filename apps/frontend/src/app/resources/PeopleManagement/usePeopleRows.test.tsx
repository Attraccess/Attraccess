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
  useAccessControlServiceResourceIntroductionsGetPeople: (...args: unknown[]) => {
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

function introduction(userId: number, groupId?: number, action = 'grant') {
  return {
    id: groupId ?? 100,
    receiverUser: { id: userId, username: `User ${userId}` },
    receiverUserId: userId,
    resourceGroupId: groupId ?? null,
    resourceGroup: groupId ? { id: groupId, name: `Group ${groupId}` } : undefined,
    createdAt: '2024-01-01',
    // Deliberately unsorted: the latest event defines validity.
    history: [
      { action, createdAt: '2024-03-01' },
      { action: 'grant', createdAt: '2024-02-01' },
    ],
  };
}

it('includes group-only people once and preserves all valid sources independently of direct status', () => {
  state.resourceIntroductions = {
    data: [
      introduction(1, 10),
      introduction(1, 11),
      introduction(2),
      introduction(2, 10),
      introduction(3, 10, 'revoke'),
    ],
  };
  const { result, rerender } = renderHook(() => usePeopleRows({ target: { type: 'resource', id: 8 } }));
  expect(result.current.rows).toHaveLength(2);
  const groupOnly = result.current.rows.find((row) => row.user.id === 1);
  expect(groupOnly).toMatchObject({
    introduction: null,
    hasValidIntroduction: true,
    hasValidDirectIntroduction: false,
  });
  expect(groupOnly?.inheritedIntroductions.map((intro) => intro.resourceGroupId)).toEqual([10, 11]);
  const direct = result.current.rows.find((row) => row.user.id === 2);
  expect(direct).toMatchObject({ hasValidIntroduction: true, hasValidDirectIntroduction: true });
  expect(direct?.inheritedIntroductions).toHaveLength(1);

  // Direct revocation must leave the group grant visible.
  state.resourceIntroductions = { data: [introduction(2, undefined, 'revoke'), introduction(2, 10)] };
  rerender();
  expect(result.current.rows[0]).toMatchObject({ hasValidIntroduction: true, hasValidDirectIntroduction: false });
  expect(result.current.rows[0].introduction).not.toBeNull();
  expect(result.current.rows[0].inheritedIntroductions).toHaveLength(1);
});

it('refreshes after one or all group sources are revoked or removed', () => {
  state.resourceIntroductions = { data: [introduction(1, 10), introduction(1, 11)] };
  const { result, rerender } = renderHook(() => usePeopleRows({ target: { type: 'resource', id: 8 } }));
  state.resourceIntroductions = { data: [introduction(1, 10, 'revoke'), introduction(1, 11)] };
  rerender();
  expect(result.current.rows).toHaveLength(1);
  expect(result.current.rows[0].inheritedIntroductions.map((intro) => intro.resourceGroupId)).toEqual([11]);
  state.resourceIntroductions = { data: [introduction(1, 10, 'revoke'), introduction(1, 11, 'revoke')] };
  rerender();
  expect(result.current.rows).toEqual([]);
  state.resourceIntroductions = { data: [introduction(1, 11)] };
  rerender();
  expect(result.current.rows[0].hasValidIntroduction).toBe(true);
  state.resourceIntroductions = { data: [] };
  rerender();
  expect(result.current.rows).toEqual([]);
});

it.each(['resource', 'group'] as const)('uses event IDs to resolve same-second %s grants and revocations', (type) => {
  const createdAt = '2026-10-07T19:08:43.000Z';
  const row = {
    ...introduction(1),
    history: [
      { id: 20, action: 'grant', createdAt },
      { id: 21, action: 'revoke', createdAt },
    ],
  };
  const data = { data: [row] };
  if (type === 'resource') state.resourceIntroductions = data;
  else state.groupIntroductions = data;
  const { result, rerender } = renderHook(() => usePeopleRows({ target: { type, id: 8 } }));
  expect(result.current.rows[0].hasValidIntroduction).toBe(false);
  row.history.unshift({ id: 22, action: 'grant', createdAt });
  if (type === 'resource') state.resourceIntroductions = { data: [row] };
  else state.groupIntroductions = { data: [row] };
  rerender();
  expect(result.current.rows[0].hasValidIntroduction).toBe(true);
});
