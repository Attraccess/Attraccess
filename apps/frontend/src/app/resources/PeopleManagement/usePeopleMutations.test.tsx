import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ResourceIntroducerType } from '@attraccess/react-query-client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePeopleMutations } from './usePeopleMutations';
const state = vi.hoisted(() => ({ calls: vi.fn(), success: vi.fn(), error: vi.fn(), failure: false, pending: false }));
vi.mock('@attraccess/react-query-client', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const hooks: Record<string, unknown> = {};
  for (const scope of ['Resource', 'ResourceGroup'])
    for (const kind of ['Introducers', 'Introductions']) {
      for (const action of ['Grant', 'Revoke']) {
        const name = `useAccessControlService${scope}${kind}${action}`;
        hooks[name] = (options: {
          onSuccess: (data: unknown, variables: unknown) => void;
          onError: (error: Error) => void;
        }) => ({
          isPending: state.pending,
          mutateAsync: async (variables: unknown) => {
            state.calls(name, variables);
            if (state.failure) {
              const error = new Error('Forbidden');
              options.onError(error);
              throw error;
            }
            options.onSuccess({}, variables);
          },
        });
      }
      for (const action of ['GetMany', 'GetHistory'])
        hooks[`UseAccessControlService${scope}${kind}${action}KeyFn`] = (params: unknown) => [
          scope,
          kind,
          action,
          params,
        ];
    }
  return { ...original, ...hooks };
});
vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.error }),
}));
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  state.failure = false;
  state.pending = false;
  client = new QueryClient();
});
afterEach(() => {
  cleanup();
  client.clear();
});
function setup(type: 'resource' | 'group') {
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue();
  const hook = renderHook(() => usePeopleMutations({ target: { type, id: 7 }, t: (key) => key }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { ...hook, invalidate };
}
it.each(['resource', 'group'] as const)(
  'routes %s grants and revocations with exact scope and cache invalidation',
  async (type) => {
    const { result, invalidate } = setup(type);
    const scope = type === 'resource' ? 'Resource' : 'ResourceGroup';
    const target = type === 'resource' ? { resourceId: 7 } : { groupId: 7 };
    await act(() => result.current.grantIntroducer(3));
    expect(state.calls).toHaveBeenLastCalledWith(`useAccessControlService${scope}IntroducersGrant`, {
      ...target,
      userId: 3,
      requestBody: { type: ResourceIntroducerType.INTRODUCER },
    });
    expect(state.success).toHaveBeenLastCalledWith({
      title: 'toasts.introducerGranted.title',
      description: 'toasts.introducerGranted.description',
    });
    await act(() => result.current.grantMaintainer(3));
    expect(state.calls).toHaveBeenLastCalledWith(`useAccessControlService${scope}IntroducersGrant`, {
      ...target,
      userId: 3,
      requestBody: { type: ResourceIntroducerType.MAINTAINER },
    });
    expect(state.success).toHaveBeenLastCalledWith({
      title: 'toasts.maintainerGranted.title',
      description: 'toasts.maintainerGranted.description',
    });
    for (const role of [ResourceIntroducerType.INTRODUCER, ResourceIntroducerType.MAINTAINER]) {
      await act(() => result.current.revokeIntroducer(3, role));
      expect(state.calls).toHaveBeenLastCalledWith(`useAccessControlService${scope}IntroducersRevoke`, {
        ...target,
        userId: 3,
        requestBody: { type: role },
      });
    }
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [scope, 'Introducers', 'GetMany', target] });
    await act(() => result.current.grantIntroduction(3, 'Safety briefing'));
    expect(state.calls).toHaveBeenLastCalledWith(`useAccessControlService${scope}IntroductionsGrant`, {
      ...target,
      userId: 3,
      requestBody: { comment: 'Safety briefing' },
    });
    await act(() => result.current.revokeIntroduction(3, ''));
    expect(state.calls).toHaveBeenLastCalledWith(`useAccessControlService${scope}IntroductionsRevoke`, {
      ...target,
      userId: 3,
      requestBody: { comment: undefined },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [scope, 'Introductions', 'GetMany', target] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: [scope, 'Introductions', 'GetHistory', { ...target, userId: 3 }],
    });
    expect(result.current.pendingIntroducer).toBeNull();
    expect(result.current.pendingIntroductionUserId).toBeNull();
    expect(result.current.isMutating).toBe(false);
  },
);
it.each(['resource', 'group'] as const)(
  'reports %s mutation errors and always clears pending identities',
  async (type) => {
    state.failure = true;
    state.pending = true;
    const { result, invalidate } = setup(type);
    expect(result.current.isMutating).toBe(true);
    const actions = [
      () => result.current.grantIntroducer(3),
      () => result.current.revokeIntroducer(3, ResourceIntroducerType.INTRODUCER),
      () => result.current.grantIntroduction(3),
      () => result.current.revokeIntroduction(3),
    ];
    for (const action of actions) {
      await act(async () => {
        await expect(action()).rejects.toThrow('Forbidden');
      });
      expect(result.current.pendingIntroducer).toBeNull();
      expect(result.current.pendingIntroductionUserId).toBeNull();
    }
    expect(state.error.mock.calls.map(([value]) => value.title)).toEqual([
      'toasts.introducerGrantFailed.title',
      'toasts.introducerRevokeFailed.title',
      'toasts.introductionGrantFailed.title',
      'toasts.introductionRevokeFailed.title',
    ]);
    expect(state.success).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  },
);
