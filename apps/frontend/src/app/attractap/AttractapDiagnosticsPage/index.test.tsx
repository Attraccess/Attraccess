import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AttractapDiagnosticsPage } from './index';

const state = vi.hoisted(() => ({ reader: undefined as unknown, isError: false }));

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({ t: (key: string, values?: { name?: string }) => `${key}${values?.name ?? ''}` }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useAttractapServiceGetReaderById: () => ({ data: state.reader, isError: state.isError }),
}));
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
  state.isError = false;
});
afterEach(cleanup);

it('shows the diagnostics of a paired reader', () => {
  state.reader = { id: 1, name: 'Workshop', pairingState: 'paired' };
  renderPage('/attractap/readers/1/diagnostics');
  expect(screen.getByText('diagnostics-1')).toBeTruthy();
  expect(screen.queryByText('not-found')).toBeNull();
});

// The API answers 404 for a reader that is not paired yet: its diagnostics must not render at all.
it('shows not found, and no diagnostics, when the reader is not available', () => {
  state.isError = true;
  renderPage('/attractap/readers/2/diagnostics');
  expect(screen.getByText('not-found')).toBeTruthy();
  expect(screen.queryByText('diagnostics-2')).toBeNull();
});
