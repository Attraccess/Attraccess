import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MqttSettingsModal } from './MqttSettingsModal';

const state = vi.hoisted(() => ({
  settings: { data: { defaultMqttServerId: 7 }, isPending: false, isError: false, error: null as Error | null },
  servers: {
    data: [{ id: 7, name: 'Workshop broker', host: 'broker.example', port: 8883, useTls: true }],
    isPending: false,
    isError: false,
    error: null as Error | null,
  },
  mutation: { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null as Error | null },
}));
vi.mock('./queries', () => ({
  useSettingsQuery: () => state.settings,
  useMqttServersQuery: () => state.servers,
  useUpdateSettingsMutation: () => state.mutation,
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.settings.isPending = false;
  state.settings.isError = false;
  state.servers.isError = false;
  state.mutation.isError = false;
  state.mutation.mutate.mockImplementation((_id, options) => options.onSuccess());
});
afterEach(cleanup);
it('saves the selected broker and closes after successful persistence', async () => {
  const onOpenChange = vi.fn();
  render(<MqttSettingsModal isOpen onOpenChange={onOpenChange} />);
  await screen.findByRole('dialog');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Default MQTT server/ }).textContent).toContain('Workshop broker'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(state.mutation.mutate).toHaveBeenCalledWith(7, expect.objectContaining({ onSuccess: expect.any(Function) }));
  expect(state.mutation.reset).toHaveBeenCalled();
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
it('disables saving until settings and server queries are available', async () => {
  state.settings.isPending = true;
  const { rerender } = render(<MqttSettingsModal isOpen onOpenChange={vi.fn()} />);
  await screen.findByRole('dialog');
  expect((screen.getByRole('button', { name: 'Save settings' }) as HTMLButtonElement).disabled).toBe(true);
  state.settings.isPending = false;
  state.servers.isError = true;
  state.servers.error = new Error('Broker list unavailable');
  rerender(<MqttSettingsModal isOpen onOpenChange={vi.fn()} />);
  expect(await screen.findByText('Broker list unavailable')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Save settings' }) as HTMLButtonElement).disabled).toBe(true);
});
it('shows mutation errors and clears mutation state on cancel', async () => {
  state.mutation.isError = true;
  state.mutation.error = new Error('Settings update rejected');
  const onOpenChange = vi.fn();
  render(<MqttSettingsModal isOpen onOpenChange={onOpenChange} />);
  expect(await screen.findByText('Settings update rejected')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(state.mutation.reset).toHaveBeenCalled();
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
