import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AttractapDiagnosticsPage, retryReaderLookup } from './index';

const state = vi.hoisted(() => ({
  reader: undefined as unknown,
  error: null as unknown,
  options: undefined as unknown,
}));

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({ t: (key: string, values?: { name?: string }) => `${key}${values?.name ?? ''}` }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useAttractapServiceGetReaderById: (_params: unknown, _key: unknown, options: unknown) => {
    state.options = options;
    return { data: state.reader, error: state.error, isError: state.error !== null };
  },
}));
vi.mock('../../../api/queryClient', () => ({ DEFAULT_RETRIES: 3 }));
vi.mock('../AttractapEditor/diagnostics/index', () => ({
  AttractapDiagnostics: ({ readerId }: { readerId?: number }) => <div>diagnostics-{readerId}</div>,
}));
vi.mock('../../not-found', () => ({ NotFound: () => <div>not-found</div> }));

const renderPage = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/attractap/readers/:readerId/diagnostics" element={<AttractapDiagnosticsPage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  state.reader = undefined;
  state.error = null;
  state.options = undefined;
});
afterEach(cleanup);

it('shows the diagnostics of a paired reader', () => {
  state.reader = { id: 1, name: 'Workshop', pairingState: 'paired' };
  renderPage('/attractap/readers/1/diagnostics');
  expect(screen.getByText('diagnostics-1')).toBeTruthy();
  expect(screen.queryByText('not-found')).toBeNull();
});

// The API answers 404 for a reader that is not paired yet: its diagnostics must not render at all.
it('shows not found, and no diagnostics, when the API answers 404', () => {
  state.error = { status: 404 };
  renderPage('/attractap/readers/2/diagnostics');
  expect(screen.getByText('not-found')).toBeTruthy();
  expect(screen.queryByText('diagnostics-2')).toBeNull();
});

it('keeps the page for other errors instead of claiming the reader does not exist', () => {
  state.error = { status: 500 };
  renderPage('/attractap/readers/3/diagnostics');
  expect(screen.queryByText('not-found')).toBeNull();
  expect(screen.getByText('diagnostics-3')).toBeTruthy();
});

it('does not retry a 404, but retries other failures', () => {
  renderPage('/attractap/readers/1/diagnostics');
  expect(state.options).toEqual(expect.objectContaining({ retry: retryReaderLookup }));
  expect(retryReaderLookup(0, { status: 404 })).toBe(false);
  expect(retryReaderLookup(0, { status: 500 })).toBe(true);
  expect(retryReaderLookup(3, { status: 500 })).toBe(false);
});
