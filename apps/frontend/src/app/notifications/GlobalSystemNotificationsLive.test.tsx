import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalSystemNotificationsLive } from './GlobalSystemNotificationsLive';

const hoisted = vi.hoisted(() => ({
  onUpdate: undefined as ((event: unknown) => void) | undefined,
  infoToast: vi.fn(),
  navigate: vi.fn(),
  user: { id: 1 },
}));

vi.mock('../../utils/sse', () => ({
  useSSE: ({ path, onUpdate, enabled }: { path: string; onUpdate: (event: unknown) => void; enabled?: boolean }) => {
    hoisted.onUpdate = onUpdate;
    return { path, enabled };
  },
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: hoisted.user }),
}));

vi.mock('../../components/toastProvider', () => ({
  useToastMessage: () => ({ info: hoisted.infoToast }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => hoisted.navigate };
});

beforeEach(() => {
  hoisted.onUpdate = undefined;
  hoisted.infoToast.mockReset();
  hoisted.navigate.mockReset();
  hoisted.user = { id: 1 };
});

describe('GlobalSystemNotificationsLive', () => {
  it('shows a toast for live system notifications', () => {
    render(<GlobalSystemNotificationsLive />, { wrapper: MemoryRouter });

    hoisted.onUpdate?.({
      category: 'messages',
      title: 'alice',
      body: 'Hello there',
      url: '/messages?conversation=10',
    });

    expect(hoisted.infoToast).toHaveBeenCalledWith({
      title: 'alice',
      description: 'Hello there',
      duration: 5000,
      action: expect.objectContaining({ label: 'Open' }),
    });
  });

  it('opens the target URL when the toast action is clicked', () => {
    render(<GlobalSystemNotificationsLive />, { wrapper: MemoryRouter });

    hoisted.onUpdate?.({
      title: 'Project invitation',
      body: 'You were invited to Project A',
      url: '/projects/1',
    });

    const toastOptions = hoisted.infoToast.mock.calls[0][0];
    toastOptions.action.onClick();

    expect(hoisted.navigate).toHaveBeenCalledWith('/projects/1');
  });
});
