import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BalenaPage } from './index';
const state = vi.hoisted(() => ({ reboot: vi.fn(), shutdown: vi.fn() }));
vi.mock('@attraccess/react-query-client', () => ({
  useSystemServiceRebootHost: () => ({ mutate: state.reboot }),
  useSystemServiceShutdownHost: () => ({ mutate: state.shutdown }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it.each(['Reboot', 'Shutdown'] as const)(
  'requires a second click for %s and expires the confirmation after one second',
  (action) => {
    render(
      <MemoryRouter>
        <BalenaPage />
      </MemoryRouter>,
    );
    const mutation = action === 'Reboot' ? state.reboot : state.shutdown;
    fireEvent.click(screen.getByRole('button', { name: action }));
    expect(mutation).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: `Confirm ${action}` })).toBeTruthy();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('button', { name: action })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: action }));
    fireEvent.click(screen.getByRole('button', { name: `Confirm ${action}` }));
    expect(mutation).toHaveBeenCalledOnce();
    expect(action === 'Reboot' ? state.shutdown : state.reboot).not.toHaveBeenCalled();
  },
);
