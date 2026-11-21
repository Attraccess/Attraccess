// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WallDisplayPage } from './WallDisplayPage';

const api = vi.hoisted(() => ({ getWallSnapshot: vi.fn() }));
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getWallSnapshot: api.getWallSnapshot,
  wallEventsUrl: (token: string) => `http://api.test/api/status-wall/public/${token}/events`,
  imageSrc: (url: string) => `http://api.test${url}`,
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, () => void>();
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, listener);
  }
  close() {
    this.closed = true;
  }
}

class FakeResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
}

function renderAt(token: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/status-wall/${token}`]}>
        <Routes>
          <Route path="/status-wall/:token" element={<WallDisplayPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('WallDisplayPage', () => {
  it('shows every resource in its state, with a count per state, and listens for changes', async () => {
    api.getWallSnapshot.mockResolvedValue({
      name: 'Workshop hall',
      generatedAt: '2026-11-21T10:00:00.000Z',
      tiles: [
        { id: 1, name: 'Laser', imageUrl: '/cdn/resources/1/original/laser.webp', state: 'in-use', since: null },
        { id: 2, name: 'Lathe', imageUrl: null, state: 'maintenance', since: null },
        { id: 3, name: 'Drill', imageUrl: null, state: 'ready', since: null },
        { id: 4, name: 'Saw', imageUrl: null, state: 'ready', since: null },
      ],
    });

    renderAt('secret-token-0123456789');

    expect(await screen.findByText('Workshop hall')).toBeInTheDocument();
    expect(document.querySelector('[data-cy="status-wall-tile-1"]')).toHaveAttribute('data-state', 'in-use');
    expect(document.querySelector('[data-cy="status-wall-tile-2"]')).toHaveAttribute('data-state', 'maintenance');
    expect(document.querySelector('[data-cy="status-wall-count-ready"]')).toHaveTextContent('2');
    expect(document.querySelector('[data-cy="status-wall-count-in-use"]')).toHaveTextContent('1');
    expect(document.querySelector('[data-cy="status-wall-count-maintenance"]')).toHaveTextContent('1');
    expect(document.querySelector('img')).toHaveAttribute('src', 'http://api.test/cdn/resources/1/original/laser.webp');
    expect(api.getWallSnapshot).toHaveBeenCalledWith('secret-token-0123456789');
    expect(FakeEventSource.instances.map((source) => source.url)).toContain(
      'http://api.test/api/status-wall/public/secret-token-0123456789/events',
    );
  });

  it('explains a link that is no longer valid and stops listening', async () => {
    api.getWallSnapshot.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));

    renderAt('old-token-0123456789abc');

    expect(await screen.findByText('This link is no longer valid')).toBeInTheDocument();
    expect(FakeEventSource.instances.every((source) => source.closed)).toBe(true);
  });
});
