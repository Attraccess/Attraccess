import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaUpdateIndicator } from './PwaUpdateIndicator';
import { usePwaUpdateStore } from './updateController';

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
  it('renders nothing when idle', () => {
    const { container } = render(<PwaUpdateIndicator />);
    expect(container).toBeEmptyDOMElement();
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

  it('shows the ready card, collapses on Later and reopens', () => {
    usePwaUpdateStore.setState({ status: 'ready', progress: 1 });
    render(<PwaUpdateIndicator />);
    expect(screen.getByText('ready.title')).toBeTruthy();
    fireEvent.click(screen.getByText('ready.later'));
    expect(screen.queryByText('ready.title')).toBeNull();
    fireEvent.click(screen.getByLabelText('ready.reopen'));
    expect(screen.getByText('ready.title')).toBeTruthy();
  });

  it('moves to the adjacent corner with arrow keys and persists it', () => {
    usePwaUpdateStore.setState({ status: 'ready', progress: 1 });
    render(<PwaUpdateIndicator />);
    fireEvent.keyDown(screen.getByRole('group'), { key: 'ArrowLeft' });
    expect(localStorage.getItem('attraccess.pwaUpdateIndicator.corner')).toBe('bottom-left');
  });
});
