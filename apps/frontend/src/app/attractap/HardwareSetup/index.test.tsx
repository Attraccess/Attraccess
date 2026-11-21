import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AttractapHardwareSetup } from './index';

const state = vi.hoisted(() => ({
  connection: { kind: null as 'serial' | 'bluetooth' | null, closedAfterPairing: false },
  toast: { success: vi.fn() },
}));

vi.mock('./useConfiguratorConnection', () => ({ useConfiguratorConnection: () => state.connection }));
vi.mock('./ConnectScreen', () => ({ ConnectScreen: () => <p>Connect screen</p> }));
vi.mock('./SetupTabs', () => ({ SetupTabs: () => null }));
vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => state.toast }));

beforeEach(() => {
  vi.clearAllMocks();
  state.connection = { kind: 'bluetooth', closedAfterPairing: false };
  if (!Element.prototype.getAnimations)
    Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: () => [] });
});
afterEach(cleanup);

function renderSetup() {
  return render(
    <AttractapHardwareSetup openDeviceSettings={vi.fn()}>
      {(onOpen) => <button onClick={onOpen}>Open setup</button>}
    </AttractapHardwareSetup>,
  );
}

it('confirms a reader or bridge set up with a toast once its drawer closed for the reader editor', () => {
  const view = renderSetup();
  expect(state.toast.success).not.toHaveBeenCalled();

  state.connection = { kind: null, closedAfterPairing: true };
  view.rerender(
    <AttractapHardwareSetup openDeviceSettings={vi.fn()}>
      {(onOpen) => <button onClick={onOpen}>Open setup</button>}
    </AttractapHardwareSetup>,
  );

  expect(state.toast.success).toHaveBeenCalledOnce();
  expect(state.toast.success).toHaveBeenCalledWith({
    title: 'Setup complete',
    description: 'The device is connected to Attraccess and closed its Bluetooth connection, as expected.',
  });
});

it('leaves the notice to the connect screen while the drawer is open', async () => {
  const view = renderSetup();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open setup' })));

  state.connection = { kind: null, closedAfterPairing: true };
  view.rerender(
    <AttractapHardwareSetup openDeviceSettings={vi.fn()}>
      {(onOpen) => <button onClick={onOpen}>Open setup</button>}
    </AttractapHardwareSetup>,
  );

  expect(await screen.findByText('Connect screen')).toBeTruthy();
  expect(state.toast.success).not.toHaveBeenCalled();
});
