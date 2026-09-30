import type { AttractapFirmware } from '@attraccess/react-query-client';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FirmwareFlasher } from './FirmwareFlasher';
import { FirmwareSelector } from './FirmwareSelector';
const state = vi.hoisted(() => ({
  binary: undefined as Blob | undefined,
  loading: false,
  firmwares: undefined as AttractapFirmware[] | undefined,
  connect: vi.fn(),
  flash: vi.fn(),
  success: vi.fn(),
  query: vi.fn(),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useAttractapServiceGetFirmwareBinary: (params: unknown) => {
    state.query(params);
    return { data: state.binary, isLoading: state.loading };
  },
  useAttractapServiceGetFirmwares: () => ({ data: state.firmwares, isLoading: state.loading }),
}));
vi.mock('../../../utils/esp-tools', () => ({
  ESPTools: { getInstance: () => ({ connectToDevice: state.connect, flashFirmware: state.flash }) },
}));
vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => ({ success: state.success }) }));
vi.mock('../../../components/Terminal', () => ({
  Terminal: ({ logLines }: { logLines: string[] }) => <pre>{logLines.join('\n')}</pre>,
}));
const firmware: AttractapFirmware = {
  name: 'reader',
  friendlyName: 'Production reader',
  variant: 'standard',
  variantFriendlyName: 'WiFi,Ethernet',
  version: '1.2.3',
  boardFamily: 'esp32',
  filename: 'reader.bin',
  filenameOTA: 'reader.ota.bin',
  chip: 'esp32',
  flashMode: 'dio',
  flashFreq: '40m',
  flashSize: '4MB',
};
beforeEach(() => {
  vi.clearAllMocks();
  state.binary = new Blob(['firmware']);
  state.loading = false;
  state.firmwares = undefined;
  state.connect.mockResolvedValue({ success: true });
  state.flash.mockResolvedValue({ success: true });
  if (!Element.prototype.getAnimations)
    Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: () => [] });
});
afterEach(cleanup);
it('groups production and demo firmware and returns the selected metadata', async () => {
  const select = vi.fn();
  const demo = { ...firmware, friendlyName: 'Demo reader', variant: 'demo' };
  state.firmwares = [firmware, demo];
  render(
    <MemoryRouter>
      <FirmwareSelector onSelect={select} />
    </MemoryRouter>,
  );
  expect(screen.getAllByText('WiFi')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: /Production reader/ }));
  expect(select).toHaveBeenLastCalledWith(firmware);
  fireEvent.click(screen.getByRole('button', { name: 'Demo firmware' }));
  fireEvent.click(await screen.findByRole('button', { name: /Demo reader/ }));
  expect(select).toHaveBeenLastCalledWith(demo);
});
it('shows download loading and does not flash a missing binary', () => {
  state.loading = true;
  const view = render(<FirmwareFlasher firmware={firmware} onCompleted={vi.fn()} />);
  expect(screen.getByRole('progressbar', { name: 'Firmware is being downloaded...' })).toBeTruthy();
  view.unmount();
  state.loading = false;
  state.binary = undefined;
  render(<FirmwareFlasher firmware={firmware} onCompleted={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Install Now' }));
  expect(state.connect).not.toHaveBeenCalled();
  expect(state.query).toHaveBeenCalledWith({ firmwareName: 'reader', variantName: 'standard', filename: 'reader.bin' });
});
it('passes flash settings and terminal callbacks, reporting completion at 100 percent', async () => {
  const completed = vi.fn();
  state.flash.mockImplementation(
    async ({
      onProgress,
      terminal,
    }: {
      onProgress: (value: number) => void;
      terminal: { clean: () => void; write: (line: string) => void; writeLine: (line: string) => void };
    }) => {
      terminal.writeLine('stale');
      terminal.clean();
      terminal.write('Writing');
      terminal.write('image');
      terminal.writeLine('Verified');
      onProgress(50);
      onProgress(100);
      return { success: true };
    },
  );
  render(<FirmwareFlasher firmware={firmware} onCompleted={completed} />);
  fireEvent.click(screen.getByRole('button', { name: 'Install Now' }));
  await waitFor(() => expect(completed).toHaveBeenCalledOnce());
  expect(state.flash).toHaveBeenCalledWith(
    expect.objectContaining({ firmware: state.binary, flashMode: 'dio', flashFreq: '40m', flashSize: '4MB' }),
  );
  expect(state.success).toHaveBeenCalledWith({
    title: 'Installation successful',
    description: 'You can now set up and use the NFC reader.',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Terminal Output' }));
  expect(await screen.findByText('Writing image Verified')).toBeTruthy();
  expect(screen.queryByText('stale')).toBeNull();
});
it('allows retry after connection or flashing failure without reporting completion', async () => {
  const completed = vi.fn();
  state.connect.mockResolvedValueOnce({
    success: false,
    error: { type: 'CONNECTION_FAILED', details: 'Port disconnected' },
  });
  render(<FirmwareFlasher firmware={firmware} onCompleted={completed} />);
  fireEvent.click(screen.getByRole('button', { name: 'Install Now' }));
  expect(await screen.findByText('Port disconnected')).toBeTruthy();
  expect(state.flash).not.toHaveBeenCalled();
  state.flash.mockResolvedValueOnce({ success: false, error: { type: 'FLASH_FAILED' } });
  fireEvent.click(screen.getByRole('button', { name: 'Retry Installation' }));
  expect(await screen.findByText('Installation failed')).toBeTruthy();
  expect(screen.getByText('Unknown error occurred')).toBeTruthy();
  expect(completed).not.toHaveBeenCalled();
  expect(state.success).not.toHaveBeenCalled();
});
