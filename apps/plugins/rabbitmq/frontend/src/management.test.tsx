import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RabbitmqStatusPanel } from './RabbitmqStatusPanel';
import { RabbitmqUserPanel } from './RabbitmqUserPanel';
import { RabbitmqUserFormModal } from './RabbitmqUserFormModal';
import { RabbitmqPermissionsModal } from './RabbitmqPermissionsModal';
import { useDetection, type RabbitmqDetectionResult } from './detection';
import { DEFAULT_MQTT_PERMISSIONS } from './users-api';

const request = vi.hoisted(() => vi.fn());
vi.mock('@attraccess/plugins-frontend-sdk', () => ({
  createPluginApiClient: (base: string) => ({
    request: (path: string, options: unknown) => request(base + path, options),
  }),
}));
const detected: RabbitmqDetectionResult = {
  mqttServerId: 1,
  isRabbitMQ: true,
  reachable: true,
  authOk: true,
  rabbitmqVersion: '4.1',
  managementVersion: '4.1.1',
  managementApi: 'https://broker.test:15671',
  checkedAt: '2026-09-22',
  error: null,
};
const user = { name: 'sensor', tags: ['management'], permissions: [{ vhost: '/', ...DEFAULT_MQTT_PERMISSIONS }] };
beforeEach(() => {
  request.mockReset();
});
afterEach(cleanup);

it('deduplicates concurrent detection, serves cached results, and refreshes without discarding the last result on failure', async () => {
  let resolve!: (value: RabbitmqDetectionResult) => void;
  request.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const first = renderHook(() => useDetection(101));
  const second = renderHook(() => useDetection(101));
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => resolve(detected));
  expect(first.result.current.result).toEqual(detected);
  expect(second.result.current.loading).toBe(false);
  const third = renderHook(() => useDetection(101));
  expect(third.result.current.result).toEqual(detected);
  expect(request).toHaveBeenCalledTimes(1);
  request.mockRejectedValueOnce(new Error('Probe unavailable'));
  act(() => first.result.current.refresh());
  await waitFor(() => expect(first.result.current.error).toBe('Probe unavailable'));
  expect(first.result.current.result).toEqual(detected);
  expect(request).toHaveBeenLastCalledWith('/api/rabbitmq/detection/101', { query: { refresh: 'true' } });
});

it('shows broker versions and refreshes into a meaningful authentication failure', async () => {
  request.mockResolvedValueOnce(detected).mockResolvedValueOnce({
    ...detected,
    authOk: false,
    managementVersion: null,
    error: 'Invalid management credentials',
  });
  render(<RabbitmqStatusPanel mqttServerId={102} />);
  expect(await screen.findByText('4.1.1')).toBeTruthy();
  expect(screen.getByText('OK')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh RabbitMQ status' }));
  expect(await screen.findByText('Invalid management credentials')).toBeTruthy();
  expect(screen.getByText('Failed')).toBeTruthy();
});

it('hides broker-specific controls for an undetected broker', async () => {
  request.mockResolvedValue({ ...detected, isRabbitMQ: false });
  const { container } = render(
    <>
      <RabbitmqStatusPanel mqttServerId={103} />
      <RabbitmqUserPanel mqttServerId={103} />
    </>,
  );
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  await act(async () => {
    await Promise.resolve();
  });
  expect(container.textContent).toBe('');
});

it('validates creation then saves trimmed names, parsed tags and default MQTT permissions', async () => {
  request.mockResolvedValue(undefined);
  const onSaved = vi.fn(),
    onClose = vi.fn();
  render(
    <RabbitmqUserFormModal
      mqttServerId={7}
      isOpen
      user={null}
      vhosts={['factory']}
      onSaved={onSaved}
      onClose={onClose}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Create user' }));
  expect(await screen.findByText('Username is required.')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: ' sensor ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create user' }));
  expect(await screen.findByText('Password is required when creating a user.')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'fixture-password' } });
  fireEvent.change(screen.getByLabelText(/Tags/), { target: { value: ' management, monitoring, ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create user' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(request).toHaveBeenCalledWith('/api/rabbitmq/users/7/sensor', {
    method: 'PUT',
    body: {
      password: 'fixture-password',
      tags: ['management', 'monitoring'],
      permissions: [{ vhost: 'factory', ...DEFAULT_MQTT_PERMISSIONS }],
    },
  });
  expect(onClose).toHaveBeenCalledOnce();
});

it('keeps existing passwords when editing and preserves the form after failed saves', async () => {
  request.mockRejectedValueOnce(new Error('Management unavailable')).mockResolvedValueOnce(undefined);
  const onSaved = vi.fn(),
    onClose = vi.fn();
  render(
    <RabbitmqUserFormModal mqttServerId={7} isOpen user={user} vhosts={['/']} onSaved={onSaved} onClose={onClose} />,
  );
  expect((screen.getByLabelText('Username') as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('Management unavailable')).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(request).toHaveBeenLastCalledWith('/api/rabbitmq/users/7/sensor', {
    method: 'PUT',
    body: { tags: ['management'] },
  });
});

it('saves edited permissions, rejects duplicate vhosts and removes persisted permissions', async () => {
  request.mockResolvedValue(undefined);
  const onSaved = vi.fn();
  render(
    <RabbitmqPermissionsModal
      mqttServerId={7}
      isOpen
      user={user}
      vhosts={['/', 'factory']}
      onSaved={onSaved}
      onClose={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText('Read'), { target: { value: '^factory$' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(request).toHaveBeenLastCalledWith('/api/rabbitmq/users/7/sensor/permissions', {
    method: 'PUT',
    body: { vhost: '/', ...DEFAULT_MQTT_PERMISSIONS, read: '^factory$' },
  });
  fireEvent.change(screen.getByLabelText(/Add vhost/), { target: { value: '/' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(screen.getByText('Permissions for vhost "/" are already listed.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Remove permissions on /' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
  expect(request).toHaveBeenLastCalledWith('/api/rabbitmq/users/7/sensor/permissions', {
    method: 'DELETE',
    query: { vhost: '/' },
  });
  expect(screen.getByText(/This user has no permissions/)).toBeTruthy();
});

it('loads users and requires confirmation before deletion, then refreshes the list', async () => {
  request.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (path.includes('/detection/')) return detected;
    if (options?.method === 'DELETE') return undefined;
    return { mqttServerId: 104, users: [user], vhosts: ['/'] };
  });
  render(<RabbitmqUserPanel mqttServerId={104} />);
  expect(await screen.findByRole('row', { name: /sensor/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Delete user sensor' }));
  const dialog = await screen.findByRole('dialog');
  expect(request.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/rabbitmq/users/104/sensor', { method: 'DELETE' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(request.mock.calls.filter(([path]) => path === '/api/rabbitmq/users/104')).toHaveLength(2);
});

it('shows user-list failures and permits an explicit retry', async () => {
  request.mockImplementation(async (path: string) => {
    if (path.includes('/detection/')) return detected;
    throw new Error('List unavailable');
  });
  render(<RabbitmqUserPanel mqttServerId={105} />);
  expect(await screen.findByText('List unavailable')).toBeTruthy();
  request.mockResolvedValue({ mqttServerId: 105, users: [], vhosts: [] });
  fireEvent.click(screen.getByRole('button', { name: 'Reload RabbitMQ users' }));
  await waitFor(() => expect(screen.queryByText('List unavailable')).toBeNull());
  expect(await screen.findByRole('grid', { name: 'RabbitMQ users' })).toBeTruthy();
});
