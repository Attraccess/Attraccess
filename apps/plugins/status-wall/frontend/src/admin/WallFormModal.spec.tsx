// @vitest-environment jsdom
import { PluginApiError } from '@attraccess/plugins-frontend-sdk';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Wall } from '../api';
import { WallFormModal } from './WallFormModal';

vi.setConfig({ testTimeout: 30_000 });

const api = vi.hoisted(() => ({ createWall: vi.fn(), updateWall: vi.fn(), listResourceGroups: vi.fn() }));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...api }));

// The real selector reads the core's generated API client, which plugin tests do not have.
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ResourceSelector: ({ onSelectionChange }: { onSelectionChange: (ids: number[]) => void }) => (
    <button type="button" onClick={() => onSelectionChange([4, 5])}>
      pick resources
    </button>
  ),
}));

const wall: Wall = {
  id: 7,
  name: 'Metal shop',
  token: 'tok',
  selection: { all: false, resourceIds: [], groupIds: [2] },
  createdAt: '2026-11-21T10:00:00.000Z',
  updatedAt: '2026-11-21T10:00:00.000Z',
};

function mount(edited: Wall | null = null) {
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <WallFormModal isOpen wall={edited} onOpenChange={onOpenChange} onSaved={onSaved} />
    </QueryClientProvider>,
  );
  return { onSaved, onOpenChange };
}

const saveButton = () => document.querySelector<HTMLButtonElement>('[data-cy="status-wall-form-save"]');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WallFormModal', () => {
  it('creates a wall showing all resources once it has a name', async () => {
    const user = userEvent.setup();
    api.createWall.mockResolvedValue({ ...wall, id: 9, name: 'Hall' });
    const { onSaved, onOpenChange } = mount();

    expect(screen.getByText('New status wall')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: /Name/ }), '  Hall  ');
    await user.click(saveButton() as HTMLButtonElement);

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }), true));
    expect(api.createWall).toHaveBeenCalledWith({
      name: 'Hall',
      selection: { all: true, resourceIds: [], groupIds: [] },
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('edits a wall: toggles groups, picks resources and saves the selection', async () => {
    const user = userEvent.setup();
    api.listResourceGroups.mockResolvedValue([
      { id: 2, name: 'Metal' },
      { id: 3, name: 'Wood' },
    ]);
    api.updateWall.mockResolvedValue(wall);
    const { onSaved } = mount(wall);

    expect(screen.getByText('Edit status wall')).toBeInTheDocument();
    await user.click(await screen.findByRole('switch', { name: 'Metal' }));
    expect(screen.getByText('Choose at least one group or resource.')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    await user.click(screen.getByRole('switch', { name: 'Wood' }));
    await user.click(screen.getByRole('button', { name: 'pick resources' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    await user.click(saveButton() as HTMLButtonElement);

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(wall, false));
    expect(api.updateWall).toHaveBeenCalledWith(7, {
      name: 'Metal shop',
      selection: { all: false, resourceIds: [4, 5], groupIds: [3] },
    });
  });

  it('says so when there are no groups', async () => {
    api.listResourceGroups.mockResolvedValue([]);
    mount({ ...wall, selection: { all: false, resourceIds: [4], groupIds: [] } });
    expect(await screen.findByText('There are no resource groups.')).toBeInTheDocument();
  });

  it('reports a failed save and keeps the form open', async () => {
    const user = userEvent.setup();
    api.createWall.mockRejectedValue(new Error('name taken'));
    const { onSaved, onOpenChange } = mount();

    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Hall');
    await user.click(saveButton() as HTMLButtonElement);

    expect(await screen.findByText('name taken')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it.each([
    ['ResourceNotFoundException', 404, /contains a resource you cannot see.*Clear the resource selection/],
    ['ResourceGroupNotFound', 404, /contains a group you cannot see.*Remove it from the selection/],
    ['ResourceListNarrowed', 403, /Switch off "Show all resources"/],
    ['Not Found', 404, /^Not Found$/],
  ])('explains the refusal "%s" in words a manager can act on', async (message, status, shown) => {
    const user = userEvent.setup();
    api.createWall.mockRejectedValue(new PluginApiError(message, status));
    mount();

    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Hall');
    await user.click(saveButton() as HTMLButtonElement);

    expect(await screen.findByText(shown)).toBeInTheDocument();
  });

  it('lets a manager drop a stored group the list does not offer', async () => {
    const user = userEvent.setup();
    api.listResourceGroups.mockResolvedValue([{ id: 3, name: 'Wood' }]);
    api.updateWall.mockResolvedValue(wall);
    mount({ ...wall, selection: { all: false, resourceIds: [], groupIds: [2, 3] } });

    expect(await screen.findByText(/not in this list: 1\./)).toBeInTheDocument();
    expect(screen.queryByText('There are no resource groups.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove them from the selection' }));
    expect(screen.queryByText(/not in this list/)).not.toBeInTheDocument();
    await user.click(saveButton() as HTMLButtonElement);

    await waitFor(() =>
      expect(api.updateWall).toHaveBeenCalledWith(7, {
        name: 'Metal shop',
        selection: { all: false, resourceIds: [], groupIds: [3] },
      }),
    );
  });

  it('closes on cancel', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = mount();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
