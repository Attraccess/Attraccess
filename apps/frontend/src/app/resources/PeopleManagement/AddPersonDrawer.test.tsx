import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFunction } from '@attraccess/plugins-frontend-ui';
import { AddPersonDrawer } from './AddPersonDrawer';

// The embedded UserSearch picker fetches users through the generated client;
// mock the hook so the test drives the real picker UI without a network layer.
const mocks = vi.hoisted(() => ({ useUsersServiceFindManyInfinite: vi.fn() }));
vi.mock('@attraccess/react-query-client', () => ({
  useUsersServiceFindManyInfinite: mocks.useUsersServiceFindManyInfinite,
}));

const t = ((key: string) => key) as TFunction;

const renderDrawer = (overrides: Partial<Parameters<typeof AddPersonDrawer>[0]> = {}) => {
  const props = {
    t,
    isOpen: true,
    mode: 'introducer' as const,
    comment: '',
    isPending: false,
    onCommentChange: vi.fn(),
    onAdd: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<AddPersonDrawer {...props} />);
  return props;
};

const pickUser = async (pointer: ReturnType<typeof userEvent.setup>, name: RegExp) => {
  await pointer.click(screen.getByRole('button', { name: /choose user/i }));
  await pointer.click(await screen.findByRole('option', { name }));
};

describe('AddPersonDrawer', () => {
  beforeEach(() => {
    mocks.useUsersServiceFindManyInfinite.mockReturnValue({
      data: { pages: [{ data: [{ id: 1, username: 'alan' }], total: 1, page: 1, limit: 50 }] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps Confirm disabled until a user is selected, then adds and closes on success', async () => {
    const pointer = userEvent.setup();
    const props = renderDrawer();

    const confirm = screen.getByRole('button', { name: 'addModal.submit' });
    expect(confirm).toBeDisabled();

    await pointer.click(confirm);
    expect(props.onAdd).not.toHaveBeenCalled();

    await pickUser(pointer, /alan/i);
    expect(confirm).toBeEnabled();

    await pointer.click(confirm);
    expect(props.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 1, username: 'alan' }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('stays open when adding fails', async () => {
    const pointer = userEvent.setup();
    const props = renderDrawer({ onAdd: vi.fn().mockRejectedValue(new Error('nope')) });

    await pickUser(pointer, /alan/i);
    await pointer.click(screen.getByRole('button', { name: 'addModal.submit' }));

    expect(props.onAdd).toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('cancel closes without adding', async () => {
    const pointer = userEvent.setup();
    const props = renderDrawer();

    await pickUser(pointer, /alan/i);
    await pointer.click(screen.getByRole('button', { name: 'addModal.cancel' }));

    expect(props.onAdd).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });
});
