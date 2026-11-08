import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { START_BLOCKED_POLL_MS, StartBlockedGate } from './index';

const { query, refetch } = vi.hoisted(() => ({
  query: {
    data: undefined as undefined | Record<string, unknown>,
    pending: false,
    error: false,
    options: undefined as undefined | Record<string, unknown>,
  },
  refetch: vi.fn(),
}));

vi.mock('@attraccess/react-query-client', () => ({
  useResourcesServiceResourceUsageStartBlocked: (_params: unknown, _key: unknown, options: Record<string, unknown>) => {
    query.options = options;
    return { data: query.data, isPending: query.pending, isError: query.error, refetch };
  },
}));

const reason = { code: 'RESERVED', title: 'Reserved', body: 'Reserved by another user until 16:00.' };
const renderGate = () =>
  render(
    <StartBlockedGate resourceId={3}>
      <button data-testid="start">Start</button>
    </StartBlockedGate>,
  );

describe('StartBlockedGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
    query.data = undefined;
    query.pending = false;
    query.error = false;
    refetch.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('shows the start controls while nothing blocks, and when the question failed', () => {
    renderGate();
    expect(screen.getByTestId('start')).toBeInTheDocument();
    query.data = { blocked: false };
    renderGate();
    expect(screen.getAllByTestId('start')).toHaveLength(2);
    expect(screen.queryByTestId('start-blocked-notice')).not.toBeInTheDocument();
  });

  it('holds the start controls back until the first answer, so they do not flash before a notice', () => {
    query.pending = true;
    renderGate();
    expect(screen.queryByTestId('start')).not.toBeInTheDocument();
  });

  it('replaces the start controls with the plugin reason only, adding no end time in another timezone', () => {
    query.data = { blocked: true, reason, until: '2026-06-01T14:00:00.000Z', plugin: 'reservations' };
    renderGate();
    expect(screen.queryByTestId('start')).not.toBeInTheDocument();
    const notice = screen.getByText('Reserved').closest('[data-cy="start-blocked-notice"]');
    expect(notice).toBeInTheDocument();
    expect(notice?.textContent).toBe('Reserved' + reason.body);
  });

  it('shows the start controls straight away when the question fails with no answer yet, without retrying first', () => {
    query.error = true;
    renderGate();
    expect(screen.getByTestId('start')).toBeInTheDocument();
    expect(document.querySelector('[data-cy="start-blocked-notice"]')).toBeNull();
    expect(query.options).toMatchObject({ retry: false });
  });

  it('keeps showing the last blocked answer when a later refresh fails', () => {
    query.error = true;
    query.data = { blocked: true, reason };
    renderGate();
    expect(screen.getByText('Reserved').closest('[data-cy="start-blocked-notice"]')).toBeInTheDocument();
    expect(screen.queryByTestId('start')).not.toBeInTheDocument();
  });

  it('polls as a safety net next to the live events', () => {
    renderGate();
    expect(query.options).toMatchObject({ refetchInterval: START_BLOCKED_POLL_MS });
  });

  it('asks again right after the announced end', () => {
    query.data = { blocked: true, reason, until: '2026-06-01T12:00:30.000Z' };
    renderGate();
    act(() => void vi.advanceTimersByTime(30_000));
    expect(refetch).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1_000));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('does not schedule anything for an end that is far away or unparsable', () => {
    query.data = { blocked: true, reason, until: '2099-01-01T00:00:00.000Z' };
    expect(() => renderGate()).not.toThrow();
    query.data = { blocked: true, reason, until: 'not a date' };
    renderGate();
    act(() => void vi.advanceTimersByTime(60_000));
    expect(refetch).not.toHaveBeenCalled();
  });
});
