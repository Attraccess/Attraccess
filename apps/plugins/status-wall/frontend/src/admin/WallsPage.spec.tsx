// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Wall } from '../api';
import { WallsPage } from './WallsPage';

vi.setConfig({ testTimeout: 30_000 });

const api = vi.hoisted(() => ({
  listWalls: vi.fn(),
  createWall: vi.fn(),
  updateWall: vi.fn(),
  regenerateWallLink: vi.fn(),
  deleteWall: vi.fn(),
  listResourceGroups: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...api }));

// The page's own logic is under test; the row menu is the shared TableRowActions, tested in its library.
vi.mock('./WallsTable', () => ({
  WallsTable: (props: {
    walls: Wall[];
    onShowLink: (wall: Wall) => void;
    onEdit: (wall: Wall) => void;
    onRegenerate: (wall: Wall) => Promise<unknown>;
    onDelete: (wall: Wall) => Promise<unknown>;
  }) => (
    <ul>
      {props.walls.map((wall) => (
        <li key={wall.id}>
          {wall.name}
          <button type="button" onClick={() => props.onShowLink(wall)}>
            link {wall.id}
          </button>
          <button type="button" onClick={() => props.onEdit(wall)}>
            edit {wall.id}
          </button>
          <button type="button" onClick={() => void props.onRegenerate(wall)}>
            regenerate {wall.id}
          </button>
          <button type="button" onClick={() => void props.onDelete(wall)}>
            delete {wall.id}
          </button>
        </li>
      ))}
    </ul>
  ),
}));

const wall = (id: number, name: string, token = `token-${id}`): Wall => ({
  id,
  name,
  token,
  selection: { all: true, resourceIds: [], groupIds: [] },
  createdAt: '2026-11-21T10:00:00.000Z',
  updatedAt: '2026-11-21T10:00:00.000Z',
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <WallsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const linkField = () => screen.findByDisplayValue(/\/status-wall\//);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WallsPage', () => {
  it('lists the walls and shows the link of one', async () => {
    const user = userEvent.setup();
    api.listWalls.mockResolvedValue([wall(1, 'Workshop hall')]);
    mount();

    expect(await screen.findByText('Workshop hall')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'link 1' }));
    expect(await linkField()).toHaveValue(`${window.location.origin}/status-wall/token-1`);
  });

  it('reports walls that could not be loaded', async () => {
    api.listWalls.mockRejectedValue(new Error('offline'));
    mount();
    expect(await screen.findByText('Could not load the status walls')).toBeInTheDocument();
    expect(screen.getByText('offline')).toBeInTheDocument();
  });

  it('shows the link of a newly created wall', async () => {
    const user = userEvent.setup();
    api.listWalls.mockResolvedValue([]);
    api.createWall.mockResolvedValue(wall(3, 'Wood shop', 'fresh'));
    mount();

    await user.click(await screen.findByRole('button', { name: 'New status wall' }));
    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Wood shop');
    await user.click(document.querySelector('[data-cy="status-wall-form-save"]') as HTMLButtonElement);

    expect(await linkField()).toHaveValue(`${window.location.origin}/status-wall/fresh`);
    expect(api.listWalls).toHaveBeenCalledTimes(2);
  });

  it('opens the form with the wall to edit', async () => {
    const user = userEvent.setup();
    api.listWalls.mockResolvedValue([wall(1, 'Workshop hall')]);
    mount();

    await user.click(await screen.findByRole('button', { name: 'edit 1' }));
    expect(await screen.findByText('Edit status wall')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveValue('Workshop hall');
  });

  it('shows the new link after regenerating it', async () => {
    const user = userEvent.setup();
    api.listWalls.mockResolvedValue([wall(1, 'Workshop hall')]);
    api.regenerateWallLink.mockResolvedValue(wall(1, 'Workshop hall', 'renewed'));
    mount();

    await user.click(await screen.findByRole('button', { name: 'regenerate 1' }));
    expect(api.regenerateWallLink).toHaveBeenCalledWith(1);
    expect(await linkField()).toHaveValue(`${window.location.origin}/status-wall/renewed`);
  });

  it('reports a failed delete', async () => {
    const user = userEvent.setup();
    api.listWalls.mockResolvedValue([wall(1, 'Workshop hall')]);
    api.deleteWall.mockRejectedValue(new Error('still in use'));
    mount();

    await user.click(await screen.findByRole('button', { name: 'delete 1' }));
    expect(await screen.findByText('still in use')).toBeInTheDocument();
    await waitFor(() => expect(api.deleteWall).toHaveBeenCalledWith(1));
  });
});
