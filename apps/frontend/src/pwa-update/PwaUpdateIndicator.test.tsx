import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaUpdateIndicator } from './PwaUpdateIndicator';
import { setPwaUpdateApply, usePwaUpdateStore } from './updateController';

const CORNER_KEY = 'attraccess.pwaUpdateIndicator.corner';

const toastMock = vi.hoisted(() => ({ info: vi.fn(), dismiss: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars?.percent !== undefined ? `${key} ${vars.percent}` : key),
  }),
}));

beforeEach(() => {
  toastMock.info.mockClear();
  toastMock.dismiss.mockClear();
  usePwaUpdateStore.setState({ status: 'idle', progress: null });
});
afterEach(() => localStorage.clear());

describe('PwaUpdateIndicator', () => {
  it('renders nothing visible when idle', () => {
    render(<PwaUpdateIndicator />);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  const showRing = (progress: number | null) => {
    render(<PwaUpdateIndicator />);
    act(() => usePwaUpdateStore.setState({ status: 'downloading', progress }));
    act(() => toastMock.info.mock.calls[0][1].onAutoClose());
    return screen.getByRole('progressbar', { name: 'downloading' });
  };

  it('is indeterminate until progress arrives', () => {
    const bar = showRing(null);
    expect(bar.hasAttribute('aria-valuenow')).toBe(false);
    expect(bar.getAttribute('aria-valuetext')).toBe('downloadingTooltipIndeterminate');
  });

  it('shows the progress tooltip when the ring gets keyboard focus', async () => {
    showRing(0.42);
    await userEvent.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('downloadingTooltip 42');
  });

  it('moves the focused ring with arrow keys', async () => {
    showRing(0.42);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowUp}');
    expect(localStorage.getItem(CORNER_KEY)).toBe('top-right');
  });

  it('shows a toast first, then a progressbar after the toast closes', () => {
    render(<PwaUpdateIndicator />);
    act(() => usePwaUpdateStore.setState({ status: 'downloading', progress: 0.42 }));
    expect(toastMock.info).toHaveBeenCalledOnce();
    expect(screen.queryByRole('progressbar', { name: 'downloading' })).toBeNull();
    act(() => toastMock.info.mock.calls[0][1].onAutoClose());
    // Only the outer element is exposed; the ring's own progressbar is hidden from assistive tech.
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    const bar = screen.getByRole('progressbar', { name: 'downloading' });
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
  });

  it('announces ready through a live region that was mounted before', () => {
    render(<PwaUpdateIndicator />);
    const live = document.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe('');
    act(() => usePwaUpdateStore.setState({ status: 'ready', progress: 1 }));
    expect(live?.textContent).toBe('ready.title');
    expect(screen.getByRole('group', { name: 'ready.title' })).toBeTruthy();
  });

  it('collapses on Later and reopens, moving focus to the new control each time', async () => {
    usePwaUpdateStore.setState({ status: 'ready', progress: 1 });
    render(<PwaUpdateIndicator />);
    // Appearing never takes focus.
    expect(document.activeElement).toBe(document.body);
    await userEvent.click(screen.getByRole('button', { name: 'ready.later' }));
    expect(screen.queryByRole('group')).toBeNull();
    const reopen = screen.getByRole('button', { name: 'ready.reopen' });
    expect(document.activeElement).toBe(reopen);
    await userEvent.click(reopen);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'ready.reload' }));
  });

  it('does not take focus when a later update becomes ready', async () => {
    usePwaUpdateStore.setState({ status: 'ready', progress: 1 });
    render(<PwaUpdateIndicator />);
    await userEvent.click(screen.getByRole('button', { name: 'ready.later' }));
    await userEvent.click(screen.getByRole('button', { name: 'ready.reopen' }));
    act(() => (document.activeElement as HTMLElement).blur());
    act(() => usePwaUpdateStore.setState({ status: 'downloading', progress: null }));
    act(() => usePwaUpdateStore.setState({ status: 'ready', progress: 1 }));
    expect(document.activeElement).toBe(document.body);
  });

  it('applies the update from Reload now', async () => {
    const apply = vi.fn();
    setPwaUpdateApply(apply);
    usePwaUpdateStore.setState({ status: 'ready', progress: 1 });
    render(<PwaUpdateIndicator />);
    await userEvent.click(screen.getByRole('button', { name: 'ready.reload' }));
    expect(apply).toHaveBeenCalledOnce();
  });

  it('moves the collapsed button with arrow keys and by dragging it', async () => {
    vi.stubGlobal('innerWidth', 1000);
    vi.stubGlobal('innerHeight', 800);
    usePwaUpdateStore.setState({ status: 'ready', progress: 1 });
    render(<PwaUpdateIndicator />);
    await userEvent.click(screen.getByRole('button', { name: 'ready.later' }));
    const reopen = screen.getByRole('button', { name: 'ready.reopen' });
    await userEvent.keyboard('{ArrowLeft}');
    expect(localStorage.getItem(CORNER_KEY)).toBe('bottom-left');

    // jsdom has no layout: the button sits at (0, 0); drag it to the bottom-right.
    fireEvent.pointerDown(reopen, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 0, clientY: 0 });
    fireEvent.pointerMove(reopen, { pointerId: 1, pointerType: 'mouse', buttons: 1, clientX: 900, clientY: 700 });
    fireEvent.pointerUp(reopen, { pointerId: 1, pointerType: 'mouse', clientX: 900, clientY: 700 });
    expect(localStorage.getItem(CORNER_KEY)).toBe('bottom-right');
    vi.unstubAllGlobals();
  });

  it('moves to the adjacent corner with arrow keys and persists it', () => {
    usePwaUpdateStore.setState({ status: 'ready', progress: 1 });
    render(<PwaUpdateIndicator />);
    fireEvent.keyDown(screen.getByRole('group'), { key: 'ArrowLeft' });
    expect(localStorage.getItem(CORNER_KEY)).toBe('bottom-left');
  });
});
