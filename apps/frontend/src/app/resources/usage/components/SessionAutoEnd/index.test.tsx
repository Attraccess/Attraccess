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
vi.mock('../../../../../hooks/useNow', () => ({ useNow: () => new Date(NOW) }));
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
    expect(screen.getByText(/^Stops automatically at .* \(in 30m\)$/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('+1 h'));
    expect(state.mutate).toHaveBeenCalledWith({ path: { resourceId: 1 }, body: { usageId: 7, extendByMinutes: 60 } });
  });

  it('is read-only for everyone else', () => {
    render(<SessionAutoEnd resourceId={1} usage={usage(at(30))} canExtend={false} />);
    const text = screen.getByText(/^Stops automatically at /).textContent ?? '';
    // Others see when it stops, without the countdown or the buttons.
    expect(text).not.toContain('(in');
    expect(screen.queryByText('+1 h')).not.toBeInTheDocument();
  });

  it('says it is stopping once the deadline passed, without buttons', () => {
    render(<SessionAutoEnd resourceId={1} usage={usage(at(-1))} canExtend />);
    expect(screen.getByText('Stops automatically any moment now')).toBeInTheDocument();
    expect(screen.queryByText('+1 h')).not.toBeInTheDocument();
  });

  it('shows the time in the app locale', () => {
    render(<SessionAutoEnd resourceId={1} usage={usage(at(30))} canExtend={false} />);
    const time = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(new Date(at(30)));
    expect(screen.getByText(`Stops automatically at ${time}`)).toBeInTheDocument();
  });

  it('adds the date when the deadline is not today', () => {
    render(<SessionAutoEnd resourceId={1} usage={usage(at(3 * 24 * 60))} canExtend={false} />);
    const deadline = new Date(at(3 * 24 * 60));
    const date = new Intl.DateTimeFormat('en', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(deadline);
    const time = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(deadline);
    expect(screen.getByText(`Stops automatically on ${date} at ${time}`)).toBeInTheDocument();
  });

  it('confirms an extension with the new time and reports a refusal as an API error', () => {
    // The confirmation reads the clock when the answer arrives.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    render(<SessionAutoEnd resourceId={1} usage={usage(at(30))} canExtend />);
    state.options?.onSuccess?.({ autoEndAt: at(90) });
    vi.useRealTimers();
    const time = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(new Date(at(90)));
    expect(state.success).toHaveBeenCalledWith({
      title: 'Session extended',
      description: `The machine now stops automatically at ${time}.`,
    });
    const error = new Error('no');
    state.options?.onError?.(error);
    expect(state.apiError).toHaveBeenCalledWith(expect.objectContaining({ error, baseTranslationKey: 'api' }));
  });
});
