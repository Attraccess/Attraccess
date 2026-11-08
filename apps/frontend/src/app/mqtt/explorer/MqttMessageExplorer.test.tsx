import { act, cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { MESSAGE_LOG_CAP, MqttMessageExplorer } from './MqttMessageExplorer';
import { decodePayload, MAX_DISPLAY_CHARS } from './payload';
import { isPublishableTopic, isValidTopicFilter } from './topics';

// Coverage instrumentation plus parallel nx tasks make renders slow.
configure({ asyncUtilTimeout: 10_000 });

interface LiveOptions {
  mqttServerId: number;
  filter: string;
  enabled?: boolean;
  onUpdate: (event: unknown) => void;
  onUnavailable?: () => void;
}
interface ActiveSubscription {
  key: string;
  options: { current: LiveOptions };
}

const publish = vi.hoisted(() => vi.fn());
// Tracks subscriptions like the live-updates client does: one per
// (server, filter, enabled) effect run, released in its cleanup.
const live = vi.hoisted(() => ({
  active: new Set<ActiveSubscription>(),
  opened: [] as string[],
  released: 0,
}));
vi.mock('../../../utils/live-updates', async () => {
  const { useEffect, useRef } = await import('react');
  return {
    useLiveUpdates: (options: LiveOptions) => {
      const latest = useRef(options);
      latest.current = options;
      const { mqttServerId, filter, enabled = true } = options;
      useEffect(() => {
        if (!enabled) return undefined;
        const subscription = { key: `${mqttServerId}:${filter}`, options: latest };
        live.active.add(subscription);
        live.opened.push(subscription.key);
        return () => {
          live.active.delete(subscription);
          live.released += 1;
        };
      }, [mqttServerId, filter, enabled]);
      return { abort: () => undefined, owner: null };
    },
  };
});
vi.mock('@attraccess/react-query-client', () => ({
  useMqttServiceMqttExplorerPublish: () => ({ mutateAsync: publish, isPending: false }),
}));
vi.mock('./payload', async (importOriginal) => {
  const original = await importOriginal<typeof import('./payload')>();
  return { ...original, decodePayload: vi.fn(original.decodePayload) };
});

const emit = (event: unknown) =>
  act(() => {
    for (const subscription of live.active) subscription.options.current.onUpdate(event);
  });
const failStream = () =>
  act(() => {
    for (const subscription of live.active) subscription.options.current.onUnavailable?.();
  });
const activeKeys = () => [...live.active].map((subscription) => subscription.key);

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const message = (topic: string, text: string, truncated = false) => ({
  topic,
  payload: b64(new TextEncoder().encode(text)),
  size: text.length,
  truncated,
  receivedAt: 1700000000000,
});
const batch = (messages: ReturnType<typeof message>[], dropped = 0) => ({ eventType: 'messages', dropped, messages });
const isDisabled = (element: HTMLElement) => element.hasAttribute('disabled');

beforeEach(() => {
  publish.mockReset();
  live.active.clear();
  live.opened = [];
  live.released = 0;
  vi.mocked(decodePayload).mockClear();
});
afterEach(() => {
  cleanup();
  useTranslationState.setState({ language: 'en' });
});

describe('payload decoding', () => {
  it('shows JSON, text and binary payloads', () => {
    const encode = (text: string) => b64(new TextEncoder().encode(text));
    expect(decodePayload(encode('{"a":1}'))).toEqual({ kind: 'json', text: '{\n  "a": 1\n}', clipped: false });
    expect(decodePayload(encode('hello'))).toEqual({ kind: 'text', text: 'hello', clipped: false });
    expect(decodePayload(encode('123'))).toEqual({ kind: 'text', text: '123', clipped: false });
    expect(decodePayload(b64(new Uint8Array([0, 255, 16])))).toEqual({
      kind: 'binary',
      text: '00 ff 10',
      clipped: false,
    });
  });

  it('keeps a truncated payload as text when the cut splits a multi-byte character', () => {
    // `ab€` is 61 62 e2 82 ac; the backend cut after the first two bytes of `€`.
    const cut = b64(new TextEncoder().encode('ab€').subarray(0, 4));
    expect(decodePayload(cut, true)).toEqual({ kind: 'text', text: 'ab', clipped: false });
    // An untruncated payload with the same bytes really is not UTF-8.
    expect(decodePayload(cut).kind).toBe('binary');
    // A truncated payload is never pretty-printed, even when it parses.
    expect(decodePayload(b64(new TextEncoder().encode('{"a":1}')), true)).toEqual({
      kind: 'text',
      text: '{"a":1}',
      clipped: false,
    });
  });

  it('clips very long text for display', () => {
    const decoded = decodePayload(b64(new TextEncoder().encode('x'.repeat(MAX_DISPLAY_CHARS + 10))));
    expect(decoded.clipped).toBe(true);
    expect(decoded.text).toBe(`${'x'.repeat(MAX_DISPLAY_CHARS)} …`);
  });
});

describe('topic filters', () => {
  it('validates filters like the backend', () => {
    for (const valid of ['#', '+', 'a/b', 'a/+/b', 'a/#', '+/#', 'ä/ö', '$SYS/#', 'x'.repeat(256)])
      expect(isValidTopicFilter(valid)).toBe(true);
    for (const invalid of [
      '',
      'a/#/b',
      'a/b#',
      '+a',
      'a+',
      'a/\0',
      'x'.repeat(257),
      // 129 × 2 bytes: the limit counts UTF-8 bytes, not characters.
      'ä'.repeat(129),
      '$share/group/a',
      '$queue/a',
    ])
      expect(isValidTopicFilter(invalid)).toBe(false);
  });

  it('blocks invalid subscriptions in the panel', () => {
    render(<MqttMessageExplorer mqttServerId={11} />);
    const input = screen.getByRole('textbox', { name: /Topic filter/ });
    for (const value of ['a/#/b', '$share/group/#', 'x'.repeat(257)]) {
      fireEvent.change(input, { target: { value } });
      expect(screen.getByText(/Use a valid MQTT topic filter/)).toBeTruthy();
      expect(isDisabled(screen.getByRole('button', { name: 'Subscribe' }))).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
      expect(live.opened).toEqual([]);
    }
  });
});

describe('message explorer', () => {
  it('subscribes, shows newest first, clears and releases on unsubscribe and unmount', () => {
    const { unmount } = render(<MqttMessageExplorer mqttServerId={9} />);
    expect(live.active.size).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    expect(activeKeys()).toEqual(['9:' + '#']);

    emit(batch([message('a/first', 'one'), message('a/second', '{"x":1}')], 3));
    const rows = screen.getAllByText(/a\/(first|second)/);
    expect(rows[0].textContent).toBe('a/second');
    expect(screen.getByText('3 messages were dropped because too many arrived.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText('a/first')).toBeNull();
    emit(batch([], 1));
    expect(screen.getByText('1 message was dropped because too many arrived.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }));
    expect(live.active.size).toBe(0);
    expect(live.released).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    expect(live.active.size).toBe(1);
    unmount();
    expect(live.active.size).toBe(0);
    expect(live.released).toBe(2);
  });

  it('releases the subscription while paused and subscribes again on resume', () => {
    render(<MqttMessageExplorer mqttServerId={12} />);
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    emit(batch([message('a/first', 'one')]));

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(live.active.size).toBe(0);
    expect(screen.getByText(/the live stream is stopped until you resume/)).toBeTruthy();
    // The log stays while paused.
    expect(screen.getByText('a/first')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(activeKeys()).toEqual(['12:' + '#']);
    expect(live.opened).toHaveLength(2);
    emit(batch([message('a/second', 'two')]));
    expect(screen.getByText('a/second')).toBeTruthy();
  });

  it('opens a new subscription when the same filter is applied after the stream became unavailable', () => {
    render(<MqttMessageExplorer mqttServerId={13} />);
    fireEvent.change(screen.getByRole('textbox', { name: /Topic filter/ }), { target: { value: 'a/+' } });
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    failStream();
    expect(screen.getByText(/live stream is unavailable/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Apply filter' }));
    expect(screen.queryByText(/live stream is unavailable/)).toBeNull();
    expect(live.opened).toEqual(['13:' + 'a/+', '13:' + 'a/+']);
    expect(live.released).toBe(1);
    expect(live.active.size).toBe(1);
  });

  it('releases the subscription while the tab is hidden', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    render(<MqttMessageExplorer mqttServerId={14} />);
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    expect(live.active.size).toBe(1);

    visibility.mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(live.active.size).toBe(0);

    visibility.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(activeKeys()).toEqual(['14:' + '#']);
    visibility.mockRestore();
  });

  it('keeps only the newest messages', () => {
    render(<MqttMessageExplorer mqttServerId={10} />);
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    emit(batch(Array.from({ length: MESSAGE_LOG_CAP + 20 }, (_, i) => message(`t/${i}`, 'x'))));
    expect(screen.getAllByText('1 B')).toHaveLength(MESSAGE_LOG_CAP);
    expect(screen.getByText(`t/${MESSAGE_LOG_CAP + 19}`)).toBeTruthy();
    expect(screen.getByText('t/20')).toBeTruthy();
    expect(screen.queryByText('t/19')).toBeNull();
    expect(screen.queryByText('t/0')).toBeNull();
    // Messages that never fit the log are not decoded at all.
    expect(decodePayload).toHaveBeenCalledTimes(MESSAGE_LOG_CAP);
  }, 30_000);

  it('decodes each message once, not on every render', () => {
    render(<MqttMessageExplorer mqttServerId={15} />);
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    emit(batch([message('a/one', '{"x":1}'), message('a/two', 'two')]));
    expect(decodePayload).toHaveBeenCalledTimes(2);

    fireEvent.change(screen.getByLabelText('Topic'), { target: { value: 'a/b' } });
    fireEvent.change(screen.getByLabelText('Payload'), { target: { value: 'hello' } });
    fireEvent.change(screen.getByRole('textbox', { name: /Topic filter/ }), { target: { value: 'a/#' } });
    emit(batch([message('a/three', 'three')]));
    expect(decodePayload).toHaveBeenCalledTimes(3);
  });

  it('shows a truncated payload that was cut inside a character as text', () => {
    render(<MqttMessageExplorer mqttServerId={16} />);
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    const cut = new TextEncoder().encode('grüße €').subarray(0, 10);
    emit(batch([{ topic: 'a/cut', payload: b64(cut), size: 70_000, truncated: true, receivedAt: 1700000000000 }]));
    expect(screen.getByText('grüße')).toBeTruthy();
    expect(screen.getByText('truncated')).toBeTruthy();
    expect(screen.queryByText('binary (hex)')).toBeNull();
  });
});

describe('publish form', () => {
  it('enables publishing only for a topic without wildcards and reports success and failure', async () => {
    publish.mockResolvedValue(undefined);
    render(<MqttMessageExplorer mqttServerId={11} />);
    const publishButton = () => screen.getByRole('button', { name: 'Publish' });
    expect(isDisabled(publishButton())).toBe(true);

    fireEvent.change(screen.getByLabelText('Topic'), { target: { value: 'a/#' } });
    expect(isDisabled(publishButton())).toBe(true);
    expect(screen.getByText('Enter a topic without the wildcards + or #.')).toBeTruthy();
    fireEvent.click(publishButton());
    expect(publish).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Topic'), { target: { value: 'a/b' } });
    expect(isDisabled(publishButton())).toBe(false);
    expect(screen.queryByText('Enter a topic without the wildcards + or #.')).toBeNull();
    fireEvent.change(screen.getByLabelText('Payload'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Retain' }));
    fireEvent.click(publishButton());
    expect(await screen.findByText('Message published.')).toBeTruthy();
    expect(publish).toHaveBeenCalledWith({
      id: 11,
      requestBody: { topic: 'a/b', payload: 'hi', qos: 0, retain: true },
    });

    // Editing the message clears the previous result.
    fireEvent.change(screen.getByLabelText('Payload'), { target: { value: 'hi again' } });
    expect(screen.queryByText('Message published.')).toBeNull();

    publish.mockRejectedValueOnce(new Error('Broker refused the message'));
    fireEvent.click(publishButton());
    await waitFor(() => expect(screen.getByText('Broker refused the message')).toBeTruthy());
  });
});

describe('another server and topic suggestions', () => {
  it('restarts a running subscription and clears the log when the server changes', () => {
    const { rerender } = render(<MqttMessageExplorer mqttServerId={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    emit(batch([message('a/first', 'one')], 2));
    expect(screen.getByText('a/first')).toBeTruthy();

    rerender(<MqttMessageExplorer mqttServerId={2} />);
    expect(screen.queryByText('a/first')).toBeNull();
    expect(screen.queryByText(/were dropped/)).toBeNull();
    expect(activeKeys()).toEqual(['2:#']);
    expect(live.released).toBe(1);
  });

  it('does not subscribe on its own after the server changes', () => {
    const { rerender } = render(<MqttMessageExplorer mqttServerId={1} />);
    rerender(<MqttMessageExplorer mqttServerId={2} />);
    expect(live.opened).toEqual([]);
  });

  it('offers suggested topics: filters fill the filter field, topics the publish field', () => {
    render(
      <MqttMessageExplorer
        mqttServerId={3}
        topicSuggestions={{ filters: ['door/+/state', 'lamp/set'], topics: ['lamp/set'] }}
      />,
    );
    // The first filter is preselected.
    expect((screen.getByRole('textbox', { name: /Topic filter/ }) as HTMLInputElement).value).toBe('door/+/state');

    // 'lamp/set' is offered twice: once for the filter field, once for the publish field.
    const chips = screen.getAllByRole('button', { name: 'lamp/set' });
    expect(chips).toHaveLength(2);
    fireEvent.click(chips[0]);
    expect((screen.getByRole('textbox', { name: /Topic filter/ }) as HTMLInputElement).value).toBe('lamp/set');
    fireEvent.click(chips[1]);
    expect((screen.getByLabelText('Topic') as HTMLInputElement).value).toBe('lamp/set');
    expect(isDisabled(screen.getByRole('button', { name: 'Publish' }))).toBe(false);
  });

  it('checks publish topics', () => {
    expect(isPublishableTopic('a/b')).toBe(true);
    for (const invalid of ['', 'a/+', 'a/#', 'a\0', 'x'.repeat(1025)]) expect(isPublishableTopic(invalid)).toBe(false);
  });
});
