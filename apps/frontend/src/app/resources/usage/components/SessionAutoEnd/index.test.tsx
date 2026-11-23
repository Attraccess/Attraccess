import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResourceUsage } from '@attraccess/react-query-client';
import { SessionAutoEnd } from './index';

const NOW = new Date('2026-01-01T10:00:00.000Z').getTime();
const state = vi.hoisted(() => ({
  mutate: vi.fn(),
  success: vi.fn(),
  apiError: vi.fn(),
  options: undefined as undefined | { onSuccess?: (s: unknown) => void; onError?: (e: Error) => void },
}));

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('../../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: vi.fn(), apiError: state.apiError }),
}));
vi.mock('../../../../resourceOverview/activeUsageSessionsBanner/mySessionsQuery', () => ({
  mySessionsQueryKey: () => ['mine'],
}));
vi.mock('../../hooks/useNow', () => ({ useNow: () => NOW }));
vi.mock('@attraccess/react-query-client', () => ({
  UseResourceUsageGetActiveSessionKeyFn: () => ['active'],
  useResourceUsageExtendSession: (_key: unknown, options: typeof state.options) => {
    state.options = options;
    return { mutate: state.mutate, isPending: false };
  },
}));

const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();
const usage = (autoEndAt: string | null, maxAutoEndAt: string | null = null) =>
  ({ id: 7, startTime: at(-5), autoEndAt, maxAutoEndAt }) as unknown as ResourceUsage;

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('SessionAutoEnd', () => {
  it('renders nothing for a session without a deadline', () => {
    const { container } = render(<SessionAutoEnd resourceId={1} usage={usage(null)} canExtend />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the countdown and the extend controls to those who may extend', () => {
    render(<SessionAutoEnd resourceId={1} usage={usage(at(30))} canExtend />);
    expect(screen.getByText(/^Stops automatically at .* \(in /)).toBeInTheDocument();
    fireEvent.click(screen.getByText('+1h'));
    expect(state.mutate).toHaveBeenCalledWith({ path: { resourceId: 1 }, body: { usageId: 7, extendByMinutes: 60 } });
  });

  it('is read-only for everyone else', () => {
    render(<SessionAutoEnd resourceId={1} usage={usage(at(30))} canExtend={false} />);
    expect(screen.getByText(/^Stops automatically at /)).toBeInTheDocument();
    expect(screen.queryByText('+1h')).not.toBeInTheDocument();
  });

  it('says it is stopping once the deadline passed, without buttons', () => {
    render(<SessionAutoEnd resourceId={1} usage={usage(at(-1))} canExtend />);
    expect(screen.getByText("Stops automatically any moment now")).toBeInTheDocument();
    expect(screen.queryByText('+1h')).not.toBeInTheDocument();
  });

  it('adds the date when the deadline is not today', () => {
    render(<SessionAutoEnd resourceId={1} usage={usage(at(3 * 24 * 60))} canExtend={false} />);
    const text = screen.getByText(/^Stops automatically at /).textContent ?? '';
    const expected = new Date(at(3 * 24 * 60)).toLocaleString([], {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(text).toContain(expected);
  });

  it('confirms an extension with the new time and reports a refusal as an API error', () => {
    render(<SessionAutoEnd resourceId={1} usage={usage(at(30))} canExtend />);
    state.options?.onSuccess?.({ autoEndAt: at(90) });
    expect(state.success).toHaveBeenCalled();
    const error = new Error('no');
    state.options?.onError?.(error);
    expect(state.apiError).toHaveBeenCalledWith(expect.objectContaining({ error, baseTranslationKey: 'api' }));
  });
});
