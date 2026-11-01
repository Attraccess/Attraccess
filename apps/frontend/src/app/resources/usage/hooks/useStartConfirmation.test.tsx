import '@testing-library/jest-dom/vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@attraccess/react-query-client';
import {
  formatRemaining,
  getConfirmationRequired,
  getStartBlockedReason,
  useStartConfirmation,
} from './useStartConfirmation';

const apiError = (status: number, body: unknown) =>
  new ApiError(
    { method: 'POST', url: '/start' },
    { url: '/start', ok: false, status, statusText: 'Error', body },
    'message that must not matter',
  );

const required = (stepId: string, title = 'Reserved from 14:00') =>
  apiError(409, { code: 'CONFIRMATION_REQUIRED', stepId, confirmation: { title, body: 'Start anyway?' } });

describe('error recognition', () => {
  it('recognises the confirmation by code, not by message', () => {
    expect(getConfirmationRequired(required('a'))?.stepId).toBe('a');
    expect(getConfirmationRequired(apiError(409, { message: 'CONFIRMATION_REQUIRED' }))).toBeNull();
    expect(getConfirmationRequired(apiError(400, { code: 'CONFIRMATION_REQUIRED', stepId: 'a' }))).toBeNull();
    expect(getConfirmationRequired(new Error('boom'))).toBeNull();
  });

  it('recognises a block with its literal reason', () => {
    const reason = { code: 'RESERVED', title: 'Reserved', body: 'Anna booked this' };
    expect(getStartBlockedReason(apiError(403, { code: 'START_BLOCKED', reason }))).toEqual(reason);
    expect(getStartBlockedReason(apiError(403, { message: 'no' }))).toBeNull();
  });

  it('formats countdowns as m:ss and h:mm:ss', () => {
    expect(formatRemaining(65_000)).toBe('1:05');
    expect(formatRemaining(3_725_000)).toBe('1:02:05');
    expect(formatRemaining(-5)).toBe('0:00');
  });
});

describe('useStartConfirmation', () => {
  it('ignores other errors', () => {
    const retry = vi.fn();
    const { result } = renderHook(() => useStartConfirmation(retry));
    expect(result.current.handleStartError(new Error('x'), {})).toBe(false);
    expect(result.current.dialog).toBeNull();
  });

  it('confirms, retries with the step id and chains a second confirmation', async () => {
    const retry = vi.fn();
    const { result, rerender } = renderHook(() =>
      useStartConfirmation<{ notes?: string; confirmedStepIds?: string[] }>(retry),
    );
    act(() => void result.current.handleStartError(required('step-a'), { notes: 'n' }));
    const view = render(<div>{result.current.dialog}</div>);
    expect(screen.getByText('Reserved from 14:00')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Start'));
    expect(retry).toHaveBeenCalledWith({ notes: 'n', confirmedStepIds: ['step-a'] });
    view.unmount();
    rerender();

    act(() => void result.current.handleStartError(required('step-b', 'Second'), { confirmedStepIds: ['step-a'] }));
    render(<div>{result.current.dialog}</div>);
    await userEvent.click(screen.getByText('Start'));
    expect(retry).toHaveBeenLastCalledWith({ confirmedStepIds: ['step-a', 'step-b'] });
  });

  it('cancel closes without retrying', async () => {
    const retry = vi.fn();
    const { result } = renderHook(() => useStartConfirmation(retry));
    act(() => void result.current.handleStartError(required('a'), {}));
    render(<div>{result.current.dialog}</div>);
    await userEvent.click(screen.getByText('Cancel'));
    expect(retry).not.toHaveBeenCalled();
  });
});
