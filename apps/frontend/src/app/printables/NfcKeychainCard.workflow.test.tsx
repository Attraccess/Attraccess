import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NfcKeychainCard } from './NfcKeychainCard';
import type { CardRender, RenderStatus } from './useCardRender';
import { NO_OUTPUT_ERROR } from './errors';
const state = vi.hoisted(() => ({
  status: 'rendering' as RenderStatus,
  result: null as CardRender | null,
  error: null as string | null,
  render: vi.fn(),
  download: vi.fn(),
  sourceDownload: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('./useCardRender', () => ({
  useCardRender: (label: string) => {
    state.render(label);
    return { status: state.status, result: state.result, error: state.error };
  },
}));
vi.mock('./Preview', () => ({
  Preview: ({ ariaLabel }: { ariaLabel: string }) => <div aria-label={ariaLabel}>Mesh preview</div>,
}));
vi.mock('./download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./download')>()),
  downloadCard: state.download,
  triggerDownload: state.sourceDownload,
}));
const mesh = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), triangleCount: 1 };
const renderedCard: CardRender = {
  bodyStl: new ArrayBuffer(134),
  lettersStl: new ArrayBuffer(134),
  body: mesh,
  letters: mesh,
};
beforeEach(() => {
  vi.clearAllMocks();
  state.status = 'rendering';
  state.result = null;
  state.error = null;
});
afterEach(cleanup);
it('announces rendering and allows source downloads before a mesh exists', async () => {
  render(<NfcKeychainCard />);
  expect(screen.getByRole('status')).toHaveTextContent('rendering');
  expect(screen.getByRole('button', { name: 'download' })).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: 'labelField' }), { target: { value: 'Workshop' } });
  expect(state.render).toHaveBeenLastCalledWith('Workshop');
  fireEvent.click(screen.getByRole('button', { name: /format3mf/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'formatScad' }));
  fireEvent.click(screen.getByRole('button', { name: 'download' }));
  expect(state.sourceDownload).toHaveBeenCalledWith(
    expect.stringContaining('Workshop'),
    'attraccess-nfc-card-workshop.scad',
  );
  expect(state.download).not.toHaveBeenCalled();
});
it('downloads a ready mesh in the selected format', async () => {
  state.status = 'ready';
  state.result = renderedCard;
  render(<NfcKeychainCard />);
  expect(screen.getByText('Mesh preview')).toBeTruthy();
  expect(screen.getByRole('status')).toHaveTextContent('renderReady');
  fireEvent.click(screen.getByRole('button', { name: 'download' }));
  expect(state.download).toHaveBeenCalledWith(state.result, 'Tobias J.', '3mf');
  fireEvent.click(screen.getByRole('button', { name: /format3mf/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'formatStl' }));
  fireEvent.click(screen.getByRole('button', { name: 'download' }));
  expect(state.download).toHaveBeenLastCalledWith(state.result, 'Tobias J.', 'stl');
});
it.each([NO_OUTPUT_ERROR, 'Model exceeds card dimensions'])(
  'announces render failure %s and blocks stale mesh downloads',
  (error) => {
    state.status = 'error';
    state.error = error;
    state.result = renderedCard;
    render(<NfcKeychainCard />);
    expect(screen.getByRole('alert')).toHaveTextContent(error === NO_OUTPUT_ERROR ? 'errorNoOutput' : error);
    expect(screen.getByRole('button', { name: 'download' })).toBeDisabled();
  },
);
