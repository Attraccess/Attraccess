import {
  configure,
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RabbitmqConnectionsPanel } from './connections/RabbitmqConnectionsPanel';
import { RabbitmqStatsPanel, STATS_POLL_INTERVAL_MS } from './stats/RabbitmqStatsPanel';
import { RabbitmqUserPanel } from './users/RabbitmqUserPanel';
import { useCapabilities } from './capabilities';
import { useDetection } from './detection/detection';
import { usePolledResource } from './usePolledResource';
import { RabbitmqDetailSlot } from './plugin';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';

// Coverage instrumentation plus parallel nx tasks make renders slow.
configure({ asyncUtilTimeout: 10_000 });

const request = vi.hoisted(() => vi.fn());
vi.mock('@attraccess/plugins-frontend-sdk', () => ({
  createPluginApiClient: (base: string) => ({
    request: (path: string, options: unknown) => request(base + path, options),
  }),
}));

// Lets every pending promise (including rejections) settle.
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
const isGet = (options?: { method?: string }) => options?.method === undefined;

const connection = {
  name: '10.0.0.2:5000 -> 10.0.0.1:1883',
  clientId: 'sensor-1',
  user: 'dev',
  vhost: '/',
  peerHost: '10.0.0.2',
  peerPort: 5000,
  protocol: 'MQTT 3.1.1',
  state: 'running',
  ssl: false,
  connectedAt: 1700000000000,
  channels: 1,
  recvBytes: 2048,
  sendBytes: 10,
  recvRate: 1.5,
  sendRate: null,
};

beforeEach(() => {
  request.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useTranslationState.setState({ language: 'en' });
});

it('lists connections, shows an empty state and surfaces management errors', async () => {
  request.mockRejectedValueOnce(new Error('The configured MQTT server user lacks management privileges'));
  render(<RabbitmqConnectionsPanel mqttServerId={1} canManage={false} />);
  expect(await screen.findByText(/lacks management privileges/)).toBeTruthy();

  request.mockResolvedValueOnce({ mqttServerId: 1, total: 0, truncated: false, connections: [] });
  fireEvent.click(screen.getByRole('button', { name: 'Reload connections' }));
  expect(await screen.findByText('No clients are connected.')).toBeTruthy();

  request.mockResolvedValueOnce({ mqttServerId: 1, total: 1, truncated: false, connections: [connection] });
  fireEvent.click(screen.getByRole('button', { name: 'Reload connections' }));
  expect(await screen.findByText('sensor-1')).toBeTruthy();
  expect(screen.getByText('10.0.0.2:5000')).toBeTruthy();
  expect(screen.getByText('MQTT 3.1.1')).toBeTruthy();
});

it('hides force-close for view-only users', async () => {
  request.mockResolvedValue({ mqttServerId: 2, total: 1, truncated: false, connections: [connection] });
  render(<RabbitmqConnectionsPanel mqttServerId={2} canManage={false} />);
  await screen.findByText('sensor-1');
  expect(screen.queryByRole('button', { name: /Close connection/ })).toBeNull();
});

it('confirms before closing a connection, sends the reason and refreshes the list afterwards', async () => {
  let closed = false;
  request.mockImplementation(async (_path: string, options?: { method?: string }) => {
    if (options?.method === 'DELETE') {
      closed = true;
      return undefined;
    }
    return { mqttServerId: 3, total: 1, truncated: false, connections: closed ? [] : [connection] };
  });
  render(<RabbitmqConnectionsPanel mqttServerId={3} canManage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Close connection sensor-1' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(request.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false);
  fireEvent.change(within(dialog).getByLabelText('Reason (optional)'), { target: { value: 'maintenance' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close connection' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith('/api/rabbitmq/connections/3', {
      method: 'DELETE',
      query: { name: connection.name, reason: 'maintenance' },
    }),
  );
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  // The list is loaded again after the close and shows the broker's new state.
  expect(await screen.findByText('No clients are connected.')).toBeTruthy();
  const calls = request.mock.calls.map(([, options]) => options);
  const deleteAt = calls.findIndex((options) => options?.method === 'DELETE');
  expect(calls.slice(deleteAt + 1).some(isGet)).toBe(true);
});

it('keeps the close dialog open and shows the error when closing fails', async () => {
  request.mockImplementation(async (_path: string, options?: { method?: string }) => {
    if (options?.method === 'DELETE') throw new Error('Broker refused');
    return { mqttServerId: 4, total: 1, truncated: false, connections: [connection] };
  });
  render(<RabbitmqConnectionsPanel mqttServerId={4} canManage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Close connection sensor-1' }));
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close connection' }));
  expect(await within(dialog).findByText('Broker refused')).toBeTruthy();
  // The client may already be gone: the list behind the dialog is loaded again after the failed close.
  await waitFor(() => {
    const calls = request.mock.calls.map(([, options]) => options);
    const deleteAt = calls.findIndex((options) => options?.method === 'DELETE');
    expect(deleteAt).toBeGreaterThan(-1);
    expect(calls.slice(deleteAt + 1).some(isGet)).toBe(true);
  });
});

it('queues a reload requested while a load is in flight instead of dropping it', async () => {
  const pending: ((value: string) => void)[] = [];
  const fetcher = vi.fn(() => new Promise<string>((resolve) => pending.push(resolve)));
  const { result } = renderHook(() => usePolledResource(fetcher, 60_000, 'failed'));
  expect(fetcher).toHaveBeenCalledTimes(1);
  // Two reloads during the first load collapse into one follow-up load.
  void result.current.reload();
  void result.current.reload();
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => pending[0]('before'));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  await act(async () => pending[1]('after'));
  await waitFor(() => expect(result.current.data).toBe('after'));
  expect(result.current.loading).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('polls connections while visible, pauses while hidden and stops on unmount', async () => {
  vi.useFakeTimers();
  request.mockResolvedValue({ mqttServerId: 5, total: 0, truncated: false, connections: [] });
  const { unmount } = render(<RabbitmqConnectionsPanel mqttServerId={5} canManage={false} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(request).toHaveBeenCalledTimes(2);

  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(request).toHaveBeenCalledTimes(2);
  hidden.mockReturnValue(false);
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(request).toHaveBeenCalledTimes(3);

  unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(request).toHaveBeenCalledTimes(3);
  hidden.mockRestore();
});

it('renders overview, nodes and queues and tolerates missing fields', async () => {
  request.mockResolvedValue({
    mqttServerId: 6,
    overview: {
      rabbitmqVersion: '3.13.0',
      erlangVersion: null,
      clusterName: 'rabbit@host',
      connections: 2,
      channels: null,
      queues: 1,
      consumers: null,
      messagesReady: 5,
      messagesUnacknowledged: null,
      publishRate: 1.5,
      deliverRate: null,
    },
    nodes: [
      {
        name: 'rabbit@host',
        running: true,
        memUsed: 1048576,
        memLimit: 4194304,
        memAlarm: true,
        diskFree: null,
        diskFreeLimit: null,
        diskFreeAlarm: null,
        fdUsed: 10,
        fdTotal: 100,
        socketsUsed: null,
        socketsTotal: null,
        uptime: 90_000_000,
      },
    ],
    queues: [
      {
        vhost: '/',
        name: 'mqtt-subscription-a',
        type: 'classic',
        state: 'running',
        messagesReady: 3,
        messagesUnacknowledged: 0,
        consumers: 1,
      },
    ],
    totalQueues: 1,
  });
  render(<RabbitmqStatsPanel mqttServerId={6} />);
  expect(await screen.findByText('3.13.0')).toBeTruthy();
  expect(screen.getByText('1.5 /s')).toBeTruthy();
  expect(screen.getByText('1.0 MiB / 4.0 MiB')).toBeTruthy();
  expect(screen.getByText('Alarm active')).toBeTruthy();
  expect(screen.getByText('1d 1h 0m')).toBeTruthy();
  expect(screen.getByText('mqtt-subscription-a')).toBeTruthy();
  expect(screen.getAllByText('—').length).toBeGreaterThan(0);

  cleanup();
  useTranslationState.setState({ language: 'de' });
  render(<RabbitmqStatsPanel mqttServerId={6} />);
  expect(await screen.findByText('1,5 /s')).toBeTruthy();
  expect(screen.getByText('1,0 MiB / 4,0 MiB')).toBeTruthy();
  expect(screen.getByText('Alarm aktiv')).toBeTruthy();
});

it('polls stats every 15 s and stops on unmount', async () => {
  vi.useFakeTimers();
  request.mockResolvedValue({ mqttServerId: 30, overview: {}, nodes: [], queues: [], totalQueues: 0 });
  const { unmount } = render(<RabbitmqStatsPanel mqttServerId={30} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(STATS_POLL_INTERVAL_MS).toBe(15_000);
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenLastCalledWith('/api/rabbitmq/stats/30', undefined);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(14_999);
  });
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(request).toHaveBeenCalledTimes(2);

  unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(request).toHaveBeenCalledTimes(2);
});

it('shows a stats error with the broker message', async () => {
  request.mockRejectedValue(new Error('Cannot reach the RabbitMQ management API'));
  render(<RabbitmqStatsPanel mqttServerId={7} />);
  expect(await screen.findByText('Cannot reach the RabbitMQ management API')).toBeTruthy();
});

it('fetches capabilities and fails closed', async () => {
  request.mockResolvedValueOnce({ canManage: true });
  const allowed = renderHook(() => useCapabilities());
  await waitFor(() => expect(allowed.result.current.canManage).toBe(true));
  expect(request).toHaveBeenCalledWith('/api/rabbitmq/capabilities', undefined);
  request.mockRejectedValueOnce(new Error('403'));
  const denied = renderHook(() => useCapabilities());
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  // Let the rejected request settle before checking that the hook stayed closed.
  await settle();
  expect(denied.result.current.canManage).toBe(false);
});

it('does not call the capabilities endpoint while disabled', async () => {
  request.mockClear();
  const disabled = renderHook(() => useCapabilities(false));
  await act(async () => {
    await Promise.resolve();
  });
  expect(request).not.toHaveBeenCalled();
  expect(disabled.result.current.canManage).toBe(false);
});

it('hides the user write actions without the manage tier', async () => {
  request.mockImplementation(async (path: string) => {
    if (path.includes('/detection/'))
      return { mqttServerId: 8, isRabbitMQ: true, reachable: true, authOk: true, error: null };
    return {
      mqttServerId: 8,
      users: [{ name: 'sensor', tags: [], permissions: [] }],
      vhosts: ['/'],
    };
  });
  render(<RabbitmqUserPanel mqttServerId={8} canManage={false} />);
  await screen.findByRole('row', { name: /sensor/ });
  expect(screen.queryByRole('button', { name: 'Add user' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Edit user sensor' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Delete user sensor' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Edit permissions of sensor' })).toBeNull();
});

const slotRequest = (options: { isRabbitMQ: boolean; authOk: boolean; canManage: boolean }) => async (path: string) => {
  if (path.includes('/detection/'))
    return { mqttServerId: 20, reachable: true, error: null, checkedAt: 'x', ...options };
  if (path.includes('/capabilities')) return { canManage: options.canManage };
  if (path.includes('/connections/')) return { mqttServerId: 20, total: 0, truncated: false, connections: [] };
  if (path.includes('/stats/')) return { mqttServerId: 20, overview: {}, nodes: [], queues: [], totalQueues: 0 };
  return { mqttServerId: 20, users: [], vhosts: [] };
};

it('composes the detail slot per detection result and permission tier', async () => {
  request.mockImplementation(slotRequest({ isRabbitMQ: false, authOk: false, canManage: true }));
  const none = render(<RabbitmqDetailSlot mqttServerId={20} />);
  // Wait for detection to resolve (to "not RabbitMQ") before checking the slot stays empty.
  const detection = renderHook(() => useDetection(20));
  await waitFor(() => expect(detection.result.current.result?.isRabbitMQ).toBe(false));
  await settle();
  expect(none.container.textContent).toBe('');
  expect(request.mock.calls.some(([path]) => String(path).includes('/capabilities'))).toBe(false);
  cleanup();

  request.mockImplementation(slotRequest({ isRabbitMQ: true, authOk: false, canManage: true }));
  render(<RabbitmqDetailSlot mqttServerId={21} />);
  await screen.findByText('RabbitMQ');
  expect(screen.queryByText('Connections')).toBeNull();
  cleanup();

  request.mockImplementation(slotRequest({ isRabbitMQ: true, authOk: true, canManage: false }));
  render(<RabbitmqDetailSlot mqttServerId={22} />);
  expect(await screen.findByText('Connections')).toBeTruthy();
  expect(screen.getByText('Broker statistics')).toBeTruthy();
  cleanup();

  // The message explorer is a core feature, not part of the plugin, for every tier.
  request.mockImplementation(slotRequest({ isRabbitMQ: true, authOk: true, canManage: true }));
  render(<RabbitmqDetailSlot mqttServerId={23} />);
  expect(await screen.findByText('Connections')).toBeTruthy();
  expect(screen.queryByText('Message explorer')).toBeNull();
});

it('remounts the panels when the slot switches servers', async () => {
  request.mockImplementation(async (path: string) => {
    const id = Number(path.split('/').pop());
    if (path.includes('/detection/')) return { mqttServerId: id, isRabbitMQ: true, reachable: true, authOk: true };
    if (path.includes('/capabilities')) return { canManage: false };
    if (path.includes('/connections/')) return { mqttServerId: id, total: 0, truncated: false, connections: [] };
    if (path.includes('/stats/')) {
      // The second server's stats never arrive: nothing of the first may linger meanwhile.
      if (id === 25) return new Promise(() => undefined);
      return { mqttServerId: id, overview: { clusterName: 'cluster-24' }, nodes: [], queues: [], totalQueues: 0 };
    }
    return { mqttServerId: id, users: [], vhosts: [] };
  });
  // Both detections are cached before the switch, so the slot never renders empty in between.
  const second = renderHook(() => useDetection(25));
  await waitFor(() => expect(second.result.current.result?.isRabbitMQ).toBe(true));
  const { rerender } = render(<RabbitmqDetailSlot mqttServerId={24} />);
  expect(await screen.findByText('cluster-24')).toBeTruthy();
  rerender(<RabbitmqDetailSlot mqttServerId={25} />);
  expect(screen.queryByText('cluster-24')).toBeNull();
});
