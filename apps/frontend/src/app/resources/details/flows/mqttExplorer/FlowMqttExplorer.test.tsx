import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowMqttExplorer } from './index';

const state = vi.hoisted(() => ({
  desktop: true,
  servers: [
    { id: 1, name: 'Zulu' },
    { id: 2, name: 'Alpha' },
  ] as { id: number; name: string }[],
  explorer: vi.fn(),
  mounted: 0,
  unmounted: 0,
}));

vi.mock('./useMdUp', () => ({ useMdUp: () => state.desktop }));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({ t: (key: string) => key }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useMqttServiceMqttServersGetAll: () => ({ data: state.servers, isLoading: false }),
}));
vi.mock('../../../../../components/select', () => ({
  Select: ({
    value,
    onChange,
    items,
  }: {
    value: string;
    onChange: (key: string) => void;
    items: { key: string; label: string }[];
  }) => (
    <select aria-label="server" value={value} onChange={(event) => onChange(event.target.value)}>
      {items.map((item) => (
        <option key={item.key} value={item.key}>
          {item.label}
        </option>
      ))}
    </select>
  ),
}));
vi.mock('../../../../mqtt/explorer/MqttMessageExplorer', async () => {
  const { useEffect } = await import('react');
  return {
    MqttMessageExplorer: (props: { mqttServerId: number; topicSuggestions: unknown; compact?: boolean }) => {
      state.explorer(props);
      // Mounting is what holds a subscription, so mount/unmount stands in for it.
      useEffect(() => {
        state.mounted += 1;
        return () => {
          state.unmounted += 1;
        };
      }, []);
      return <div data-testid="explorer">{props.mqttServerId}</div>;
    },
  };
});

const nodes = [
  { type: 'output.mqtt.sendMessage', data: { serverId: 1, topic: 'lamp/set' } },
  { type: 'input.mqtt.message.received', data: { serverId: 1, topic: 'lamp/state' } },
];

beforeEach(() => {
  state.desktop = true;
  state.mounted = 0;
  state.unmounted = 0;
  state.explorer.mockClear();
});
afterEach(cleanup);

describe('FlowMqttExplorer', () => {
  it('renders nothing while closed', () => {
    const { container } = render(<FlowMqttExplorer isOpen={false} onClose={vi.fn()} nodes={nodes} />);
    expect(container.innerHTML).toBe('');
  });

  it('docks beside the canvas on desktop instead of opening a modal', () => {
    render(<FlowMqttExplorer isOpen onClose={vi.fn()} nodes={nodes} />);
    const panel = screen.getByRole('region', { name: 'title' });
    expect(panel.tagName).toBe('ASIDE');
    // Not a dialog: the canvas next to it stays interactive.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(panel.closest('[aria-modal]')).toBeNull();
  });

  it("defaults to the server the flow uses most and suggests that flow's topics", () => {
    render(<FlowMqttExplorer isOpen onClose={vi.fn()} nodes={nodes} />);
    expect(screen.getByTestId('explorer').textContent).toBe('1');
    expect(state.explorer).toHaveBeenLastCalledWith({
      mqttServerId: 1,
      topicSuggestions: { filters: ['lamp/set', 'lamp/state'], topics: ['lamp/set', 'lamp/state'] },
      compact: true,
    });
  });

  it('falls back to the first server by name for a flow without MQTT nodes', () => {
    render(<FlowMqttExplorer isOpen onClose={vi.fn()} nodes={[]} />);
    expect(screen.getByTestId('explorer').textContent).toBe('2');
  });

  it('switches server on request', () => {
    render(<FlowMqttExplorer isOpen onClose={vi.fn()} nodes={nodes} />);
    fireEvent.change(screen.getByLabelText('server'), { target: { value: '2' } });
    expect(screen.getByTestId('explorer').textContent).toBe('2');
  });

  it('does not swap the server when the nodes change while the panel is open', () => {
    const { rerender } = render(<FlowMqttExplorer isOpen onClose={vi.fn()} nodes={[]} />);
    expect(screen.getByTestId('explorer').textContent).toBe('2');
    rerender(<FlowMqttExplorer isOpen onClose={vi.fn()} nodes={nodes} />);
    expect(screen.getByTestId('explorer').textContent).toBe('2');
  });

  it('closes through the close button and releases the explorer, so reopening starts fresh', () => {
    const onClose = vi.fn();
    const { rerender } = render(<FlowMqttExplorer isOpen onClose={onClose} nodes={nodes} />);
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(onClose).toHaveBeenCalledOnce();

    rerender(<FlowMqttExplorer isOpen={false} onClose={onClose} nodes={nodes} />);
    expect(state.unmounted).toBe(1);
    expect(screen.queryByTestId('explorer')).toBeNull();

    rerender(<FlowMqttExplorer isOpen onClose={onClose} nodes={nodes} />);
    expect(state.mounted).toBe(2);
  });

  it('uses a drawer on narrow screens', () => {
    state.desktop = false;
    render(<FlowMqttExplorer isOpen onClose={vi.fn()} nodes={nodes} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByTestId('explorer')).toBeTruthy();
  });
});
