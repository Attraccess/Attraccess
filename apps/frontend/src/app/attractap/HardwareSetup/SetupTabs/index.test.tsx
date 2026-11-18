import type { AttractapFirmware } from '@attraccess/react-query-client';
import type { PropsWithChildren } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SetupTabs } from './index';

const state = vi.hoisted(() => ({ flash: vi.fn(), refreshPinStatus: vi.fn() }));

const bridge = {
  name: 'attractap_bridge',
  friendlyName: 'Attractap BLE Bridge',
  variant: 'gl_s10',
  variantFriendlyName: 'GL.iNet GL-S10',
  version: '2.7.0',
  boardFamily: 'ESP32',
  filename: 'attractap_bridge_gl_s10.bin',
  filenameOTA: 'attractap_bridge_gl_s10.bin.zz',
  chip: 'esp32',
  flashMode: 'dio',
  flashFreq: '40m',
  flashSize: '4MB',
  bleBridge: true,
} satisfies AttractapFirmware;

vi.mock('@attraccess/react-query-client', () => ({
  useGetFirmwareBinary: () => ({ data: new Blob(['firmware']), isLoading: false }),
}));
vi.mock('../../../../utils/esp-tools', () => ({
  ESPTools: { getInstance: () => ({ connectToDevice: async () => ({ success: true }), flashFirmware: state.flash }) },
  ESPToolsErrorType: { CHIP_MISMATCH: 'CHIP_MISMATCH' },
}));
vi.mock('../../../../components/toastProvider', () => ({ useToastMessage: () => ({ success: vi.fn() }) }));
vi.mock('../FirmwareSelector', () => ({
  FirmwareSelector: ({ onSelect }: { onSelect: (firmware: AttractapFirmware) => void }) => (
    <button type="button" onClick={() => onSelect(bridge)}>
      pick bridge
    </button>
  ),
}));
vi.mock('../SerialConfigurator/Auth', () => ({
  AttractapSerialCommProvider: ({ children }: PropsWithChildren) => <>{children}</>,
  AttractapSerialCommGate: ({ children }: PropsWithChildren) => <>{children}</>,
  useAttractapSerialComm: () => ({
    isAuthenticated: false,
    fetchConfiguration: vi.fn(),
    refreshPinStatus: state.refreshPinStatus,
  }),
}));
vi.mock('../SerialConfigurator/Network', () => ({
  AttractapSerialConfiguratorNetwork: () => <div data-testid="serial-network" />,
}));
vi.mock('../SerialConfigurator/Api', () => ({ AttractapSerialConfiguratorApi: () => null }));
vi.mock('../SerialConfigurator/Pin', () => ({ AttractapSerialConfiguratorPin: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  state.refreshPinStatus.mockResolvedValue(undefined);
  state.flash.mockImplementation(async ({ onProgress }: { onProgress: (value: number) => void }) => {
    onProgress(100);
    return { success: true };
  });
  if (!Element.prototype.getAnimations)
    Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: () => [] });
});
afterEach(cleanup);

it('continues from a flashed BLE Bridge into the serial configurator once it was power-cycled', async () => {
  render(<SetupTabs openDeviceSettings={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'pick bridge' }));
  fireEvent.click(screen.getByRole('button', { name: 'Install Now' }));
  fireEvent.click(await screen.findByRole('button', { name: 'The bridge is in download mode, install' }));
  await waitFor(() => expect(state.flash).toHaveBeenCalledOnce());
  expect(screen.getByRole('tab', { name: 'Firmware' })).toHaveAttribute('aria-selected', 'true');

  fireEvent.click(await screen.findByRole('button', { name: 'The bridge is restarted, continue' }));
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Network' })).toHaveAttribute('aria-selected', 'true'));
  expect(screen.getByTestId('serial-network')).toBeVisible();
  expect(state.refreshPinStatus).toHaveBeenCalledOnce();
});
