import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useQrCodeAction } from './useQrCodeAction';
const state = vi.hoisted(() => ({
  navigate: vi.fn(),
  start: vi.fn(),
  end: vi.fn(),
  invalidate: vi.fn(),
  reset: vi.fn(),
  success: vi.fn(),
  apiError: vi.fn(),
  callbacks: {} as Record<
    string,
    {
      onSuccess: (data: unknown, variables: { requestBody: { forceTakeOver: boolean } }) => void;
      onError: (error: Error) => void;
    }
  >,
}));
vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: () => state.navigate,
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: state.invalidate, resetQueries: state.reset }),
}));
vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, apiError: state.apiError }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useResourcesServiceResourceUsageStartSession: (callbacks: (typeof state.callbacks)[string]) => {
    state.callbacks.start = callbacks;
    return { mutate: state.start };
  },
  useResourcesServiceResourceUsageEndSession: (callbacks: (typeof state.callbacks)[string]) => {
    state.callbacks.end = callbacks;
    return { mutate: state.end };
  },
  UseResourcesServiceResourceUsageGetActiveSessionKeyFn: (params: unknown) => ['active', params],
  UseResourcesServiceResourceUsageGetHistoryKeyFn: (params: unknown) => ['history', params],
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.callbacks = {};
});
afterEach(cleanup);
function setup(action?: string) {
  return renderHook(() => useQrCodeAction({ resourceId: 7 }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[`/resources/7${action ? `?action=${action}` : ''}`]}>{children}</MemoryRouter>
    ),
  });
}
it.each(['start', 'startAndTakeover', 'stop', 'view', 'unknown'])(
  'executes the %s link once and removes its URL action',
  (action) => {
    const { rerender } = setup(action);
    expect(state.navigate).toHaveBeenCalledWith('/resources/7', { replace: true });
    rerender();
    expect(state.navigate).toHaveBeenCalledOnce();
    if (action === 'start' || action === 'startAndTakeover')
      expect(state.start).toHaveBeenCalledExactlyOnceWith({
        resourceId: 7,
        requestBody: { notes: '-- by QR-Code --', forceTakeOver: action === 'startAndTakeover' },
      });
    else expect(state.start).not.toHaveBeenCalled();
    if (action === 'stop')
      expect(state.end).toHaveBeenCalledExactlyOnceWith({ resourceId: 7, requestBody: { notes: '-- by QR-Code --' } });
    else expect(state.end).not.toHaveBeenCalled();
  },
);
it('does nothing without an action', () => {
  setup();
  expect(state.navigate).not.toHaveBeenCalled();
  expect(state.start).not.toHaveBeenCalled();
  expect(state.end).not.toHaveBeenCalled();
});
it('invalidates only resource-specific history after start and resets the active session after stop', () => {
  setup();
  for (const forceTakeOver of [false, true])
    act(() => state.callbacks.start.onSuccess({}, { requestBody: { forceTakeOver } }));
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['active', { resourceId: 7 }] });
  expect(state.success).toHaveBeenCalledWith({
    title: 'Session started',
    description: 'The session was successfully started.',
  });
  act(() => state.callbacks.end.onSuccess({}, { requestBody: { forceTakeOver: false } }));
  expect(state.reset).toHaveBeenCalledWith({ queryKey: ['active', { resourceId: 7 }] });
  expect(state.success).toHaveBeenLastCalledWith({
    title: 'Session stopped',
    description: 'The session was successfully stopped.',
  });
  for (const [options] of state.invalidate.mock.calls) {
    if (!options.predicate) continue;
    expect(options.predicate({ queryKey: ['history', { resourceId: 7, page: 2 }] })).toBe(true);
    expect(options.predicate({ queryKey: ['history', { resourceId: 8 }] })).toBe(false);
    expect(options.predicate({ queryKey: ['other', { resourceId: 7 }] })).toBe(false);
    expect(options.predicate({ queryKey: ['history'] })).toBe(false);
  }
});
it('reports failed start and stop requests without a success toast', () => {
  setup();
  const error = new Error('Forbidden');
  for (const action of ['start', 'end']) act(() => state.callbacks[action].onError(error));
  expect(state.apiError).toHaveBeenCalledTimes(2);
  expect(state.apiError).toHaveBeenLastCalledWith(expect.objectContaining({ error, baseTranslationKey: 'api' }));
  expect(state.success).not.toHaveBeenCalled();
});
