import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HistoryModalLoader } from './HistoryModalLoader';
const state = vi.hoisted(() => ({ resource: vi.fn(), group: vi.fn() }));
vi.mock('@attraccess/react-query-client', () => ({
  useAccessControlServiceResourceIntroductionsGetHistory: (...args: unknown[]) => {
    state.resource(...args);
    return { data: ['resource event'], isLoading: false };
  },
  useAccessControlServiceResourceGroupIntroductionsGetHistory: (...args: unknown[]) => {
    state.group(...args);
    return { data: undefined, isLoading: true };
  },
}));
vi.mock('../../../components/IntroductionsManagement/history', () => ({
  IntroductionHistoryModal: ({
    history,
    isLoading,
    isOpen,
    onClose,
  }: {
    history: unknown[];
    isLoading: boolean;
    isOpen: boolean;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div>
        <output>{JSON.stringify({ history, isLoading })}</output>
        <button onClick={onClose}>Close history</button>
      </div>
    ) : null,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('only enables the active resource history and forwards close', () => {
  const close = vi.fn();
  render(<HistoryModalLoader target={{ type: 'resource', id: 7 }} userId={3} isOpen onClose={close} />);
  expect(state.resource).toHaveBeenCalledWith({ resourceId: 7, userId: 3 }, undefined, { enabled: true });
  expect(state.group).toHaveBeenCalledWith({ groupId: 7, userId: 3 }, undefined, { enabled: false });
  expect(screen.getByRole('status')).toHaveTextContent('resource event');
  fireEvent.click(screen.getByText('Close history'));
  expect(close).toHaveBeenCalledOnce();
});
it('uses group loading and defaults missing history to an empty list', () => {
  render(<HistoryModalLoader target={{ type: 'group', id: 8 }} userId={4} isOpen onClose={vi.fn()} />);
  expect(state.resource).toHaveBeenCalledWith({ resourceId: 8, userId: 4 }, undefined, { enabled: false });
  expect(state.group).toHaveBeenCalledWith({ groupId: 8, userId: 4 }, undefined, { enabled: true });
  expect(screen.getByRole('status')).toHaveTextContent('{"history":[],"isLoading":true}');
});
it.each([
  { userId: 4, isOpen: false },
  { userId: 0, isOpen: true },
])('does not fetch with userId=$userId and isOpen=$isOpen', ({ userId, isOpen }) => {
  render(<HistoryModalLoader target={{ type: 'group', id: 8 }} userId={userId} isOpen={isOpen} onClose={vi.fn()} />);
  expect(state.resource).toHaveBeenCalledWith({ resourceId: 8, userId }, undefined, { enabled: false });
  expect(state.group).toHaveBeenCalledWith({ groupId: 8, userId }, undefined, { enabled: false });
  if (!isOpen) expect(screen.queryByRole('status')).toBeNull();
});
