import { configure, act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RabbitmqConnectionsPanel } from './connections/RabbitmqConnectionsPanel';
import { RabbitmqStatsPanel } from './stats/RabbitmqStatsPanel';
import { MESSAGE_LOG_CAP, RabbitmqMessagesPanel } from './messages/RabbitmqMessagesPanel';
import { RabbitmqUserPanel } from './users/RabbitmqUserPanel';
import { decodePayload } from './messages/payload';
import { liveIdentifier } from './messages/messages-api';
import { useCapabilities } from './capabilities';
import { renderHook } from '@testing-library/react';
import { RabbitmqDetailSlot } from './plugin';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';

// Coverage instrumentation plus parallel nx tasks make renders slow.
configure({ asyncUtilTimeout: 10_000 });

const request = vi.hoisted(() => vi.fn());
const live = vi.hoisted(() => ({
  options: null as null | {
    identifier?: string;
    enabled?: boolean;
    onUpdate: (event: unknown) => void;
    onUnavailable?: () => void;
  },
  enabledHistory: [] as boolean[],
}));
vi.mock('@attraccess/plugins-frontend-sdk', () => ({
  createPluginApiClient: (base: string) => ({
    request: (path: string, options: unknown) => request(base + path, options),
  }),
  usePluginLiveUpdates: (options: NonNullable<typeof live.options>) => {
    live.options = options;
    live.enabledHistory.push(options.enabled ?? true);
  },
}));

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
  live.options = null;
  live.enabledHistory = [];
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

it('confirms before closing a connection, sends the reason and refreshes the list', async () => {
  request.mockImplementation(async (_path: string, options?: { method?: string }) =>
    options?.method === 'DELETE'
      ? undefined
      : { mqttServerId: 3, total: 1, truncated: false, connections: [connection] },
  );
  render(<RabbitmqConnectionsPanel mqttServerId={3} canManage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Close connection sensor-1' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(request.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false);
  fireEvent.change(within(dialog).getByLabelText('Reason (optional)'), { target: { value: 'maintenance' } });
  const loads = request.mock.calls.length;
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close connection' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith('/api/rabbitmq/connections/3', {
      method: 'DELETE',
      query: { name: connection.name, reason: 'maintenance' },
    }),
  );
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  await waitFor(() => expect(request.mock.calls.length).toBeGreaterThan(loads + 1));
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
  expect(screen.getByText('1d 1h')).toBeTruthy();
  expect(screen.getByText('mqtt-subscription-a')).toBeTruthy();
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
  await act(async () => {
    await Promise.resolve();
  });
  expect(denied.result.current.canManage).toBe(false);
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

it('encodes live identifiers and decodes payloads', () => {
  expect(liveIdentifier(3, 'a/+/b/#')).toBe(
    `3.${btoa('a/+/b/#').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`,
  );
  expect(liveIdentifier(1, 'ä')).toMatch(/^1\.[A-Za-z0-9_-]+$/);
  const b64 = (text: string) => btoa(text);
  expect(decodePayload(b64('{"a":1}'))).toEqual({ kind: 'json', text: '{\n  "a": 1\n}' });
  expect(decodePayload(b64('hello'))).toEqual({ kind: 'text', text: 'hello' });
  expect(decodePayload(b64('123'))).toEqual({ kind: 'text', text: '123' });
  expect(decodePayload(btoa(String.fromCharCode(0, 255, 16)))).toEqual({ kind: 'binary', text: '00 ff 10' });
});

const message = (topic: string, text: string) => ({
  topic,
  payload: btoa(text),
  size: text.length,
  truncated: false,
  receivedAt: 1700000000000,
});

it('subscribes, shows newest first, pauses, clears and releases on unsubscribe and unmount', async () => {
  const { unmount } = render(<RabbitmqMessagesPanel mqttServerId={9} />);
  expect(live.options?.enabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
  expect(live.options?.enabled).toBe(true);
  expect(live.options?.identifier).toBe(liveIdentifier(9, '#'));

  act(() =>
    live.options?.onUpdate({
      eventType: 'messages',
      dropped: 3,
      messages: [message('a/first', 'one'), message('a/second', '{"x":1}')],
    }),
  );
  const rows = screen.getAllByText(/a\/(first|second)/);
  expect(rows[0].textContent).toBe('a/second');
  expect(screen.getByText('3 messages were dropped to keep up.')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  act(() => live.options?.onUpdate({ eventType: 'messages', dropped: 0, messages: [message('a/third', 'x')] }));
  expect(screen.queryByText('a/third')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
  act(() => live.options?.onUpdate({ eventType: 'messages', dropped: 0, messages: [message('a/third', 'x')] }));
  expect(screen.getByText('a/third')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(screen.queryByText('a/third')).toBeNull();

  act(() => live.options?.onUnavailable?.());
  expect(screen.getByText(/live stream is unavailable/)).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }));
  expect(live.options?.enabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
  expect(live.options?.enabled).toBe(true);
  unmount();
});

it('caps the log', () => {
  render(<RabbitmqMessagesPanel mqttServerId={10} />);
  fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
  const batch = Array.from({ length: MESSAGE_LOG_CAP + 20 }, (_, i) => message(`t/${i}`, 'x'));
  act(() => live.options?.onUpdate({ eventType: 'messages', dropped: 0, messages: batch }));
  expect(screen.getAllByText('1 B')).toHaveLength(MESSAGE_LOG_CAP);
}, 30_000);

it('validates the publish topic and reports success and failure', async () => {
  request.mockResolvedValue(undefined);
  render(<RabbitmqMessagesPanel mqttServerId={11} />);
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  expect(await screen.findByText('Enter a topic without the wildcards + or #.')).toBeTruthy();
  expect(request).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText('Topic'), { target: { value: 'a/#' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  expect(request).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText('Topic'), { target: { value: 'a/b' } });
  fireEvent.change(screen.getByLabelText('Payload'), { target: { value: 'hi' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  expect(await screen.findByText('Message published.')).toBeTruthy();
  expect(request).toHaveBeenCalledWith('/api/rabbitmq/messages/11/publish', {
    method: 'POST',
    body: { topic: 'a/b', payload: 'hi', qos: 0, retain: false },
  });

  request.mockRejectedValueOnce(new Error('Publishing the message failed.'));
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  await waitFor(() => expect(screen.getByText('Publishing the message failed.')).toBeTruthy());
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
  await waitFor(() => expect(request).toHaveBeenCalled());
  expect(none.container.textContent).toBe('');
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
  expect(screen.queryByText('Message explorer')).toBeNull();
  cleanup();

  request.mockImplementation(slotRequest({ isRabbitMQ: true, authOk: true, canManage: true }));
  render(<RabbitmqDetailSlot mqttServerId={23} />);
  expect(await screen.findByText('Message explorer')).toBeTruthy();
});
