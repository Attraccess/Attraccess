import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SmartPlugCover } from './SmartPlugCover';
import { DEFAULT_PLUG_CONFIG, type PlugConfig } from './smartPlugConfig';
import type { PlugRender } from './usePlugRender';
import type { RenderStatus } from './useWorkerRender';
import { NO_OUTPUT_ERROR } from './errors';

const state = vi.hoisted(() => ({
  status: 'rendering' as RenderStatus,
  result: null as PlugRender | null,
  error: null as string | null,
  render: vi.fn(),
  download: vi.fn(),
  sourceDownload: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({ t: (key: string) => key }),
}));
vi.mock('./usePlugRender', () => ({
  usePlugRender: (config: PlugConfig) => {
    state.render(config);
    return { status: state.status, result: state.result, error: state.error };
  },
}));
vi.mock('./Preview', () => ({
  Preview: ({ ariaLabel }: { ariaLabel: string }) => <div aria-label={ariaLabel}>Mesh preview</div>,
}));
vi.mock('./plugDownload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./plugDownload')>()),
  downloadPlug: state.download,
}));
vi.mock('./download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./download')>()),
  triggerDownload: state.sourceDownload,
}));

const mesh = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), triangleCount: 1 };
const rendered: PlugRender = { bodyStl: new ArrayBuffer(134), coverStl: new ArrayBuffer(134), body: mesh, cover: mesh };

beforeEach(() => {
  vi.clearAllMocks();
  state.status = 'rendering';
  state.result = null;
  state.error = null;
});
afterEach(cleanup);

/** Holds the settings the way PrintablesPage does. */
function Cover() {
  const [config, setConfig] = useState<PlugConfig>(DEFAULT_PLUG_CONFIG);
  return <SmartPlugCover config={config} onConfigChange={setConfig} />;
}

async function chooseCable(name: string) {
  fireEvent.click(screen.getByRole('button', { name: /plugCable/ }));
  fireEvent.click(await screen.findByRole('option', { name }));
}

it('renders the defaults and shows the opening field for a straight cable', () => {
  render(<Cover />);
  expect(state.render).toHaveBeenLastCalledWith(DEFAULT_PLUG_CONFIG);
  expect(screen.getByRole('textbox', { name: 'cordOpeningDiameter' })).toHaveValue('12 mm');
  expect(screen.queryByRole('textbox', { name: 'heightAbovePlug' })).toBeNull();
  expect(screen.getByRole('button', { name: 'download' })).toBeDisabled();
});

it('swaps the opening for the two heights on an angled cable and resets them on a straight one', async () => {
  render(<Cover />);
  await chooseCable('cableAngledSchuko');
  expect(screen.queryByRole('textbox', { name: 'cordOpeningDiameter' })).toBeNull();
  const height = screen.getByRole('textbox', { name: 'heightAbovePlug' });
  fireEvent.change(height, { target: { value: '25' } });
  fireEvent.blur(height);
  expect(state.render).toHaveBeenLastCalledWith(
    expect.objectContaining({ cable: 'angled_schuko', heightAbovePlug: 25 }),
  );

  await chooseCable('cableStraightEuro');
  expect(state.render).toHaveBeenLastCalledWith(
    expect.objectContaining({
      cable: 'straight_euro',
      cordOpeningDiameter: 9,
      heightAbovePlug: 17.8,
      cableCutoutHeight: 24.2,
    }),
  );
  expect(screen.getByRole('textbox', { name: 'cordOpeningDiameter' })).toHaveValue('9 mm');
});

it('caps a straight Euro opening at 12 mm', async () => {
  render(<Cover />);
  await chooseCable('cableStraightEuro');
  const opening = screen.getByRole('textbox', { name: 'cordOpeningDiameter' });
  fireEvent.change(opening, { target: { value: '15' } });
  fireEvent.blur(opening);
  expect(state.render).toHaveBeenLastCalledWith(expect.objectContaining({ cordOpeningDiameter: 12 }));
});

it('downloads the configured source before a mesh exists, and the mesh once ready', async () => {
  const { rerender } = render(<Cover />);
  fireEvent.click(screen.getByRole('button', { name: /format3mf/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'formatScad' }));
  fireEvent.click(screen.getByRole('button', { name: 'download' }));
  expect(state.sourceDownload).toHaveBeenCalledWith(
    expect.stringContaining('CORD_OPEN_D = 12;'),
    'attraccess-smart-plug-cover-nous-a1-straight-schuko-clearance-0mm-opening-12mm-height-17.8mm-cutout-24.2mm.scad',
  );

  state.status = 'ready';
  state.result = rendered;
  rerender(<Cover />);
  expect(screen.getByText('Mesh preview')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /formatScad/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'formatStl' }));
  fireEvent.click(screen.getByRole('button', { name: 'download' }));
  expect(state.download).toHaveBeenCalledWith(rendered, DEFAULT_PLUG_CONFIG, 'stl');
});

it.each([
  [NO_OUTPUT_ERROR, 'plugErrorNoOutput'],
  ['Cable opening must be 5-12 mm.', 'Cable opening must be 5-12 mm.'],
])('shows render failure %s in a danger alert', (error, shown) => {
  state.status = 'error';
  state.error = error;
  state.result = rendered;
  render(<Cover />);
  expect(within(screen.getByRole('alert')).getByText(shown)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'download' })).toBeDisabled();
});

it('offers only the source while a newer render replaces the shown model', async () => {
  // The previous result is still on screen, but no longer matches the settings.
  state.status = 'rendering';
  state.result = rendered;
  render(<Cover />);
  expect(screen.getByRole('button', { name: 'download' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /format3mf/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'formatScad' }));
  expect(screen.getByRole('button', { name: 'download' })).toBeEnabled();
});
