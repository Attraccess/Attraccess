import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { DOCKED_MIN_WIDTH, FlowMqttExplorer } from './index';
import { readMqttNodes } from './mqttNodes';

const state = vi.hoisted(() => ({
  desktop: true,
  minWidth: 0,
  servers: [
    { id: 1, name: 'Zulu' },
    { id: 2, name: 'Alpha' },
  ] as { id: number; name: string }[],
  explorer: vi.fn(),
  mounted: 0,
  unmounted: 0,
}));

vi.mock('../../../../../hooks/useIsDesktop', () => ({
  useMinWidth: (px: number) => {
    state.minWidth = px;
    return state.desktop;
  },
}));
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

const nodes = readMqttNodes([
  { type: 'output.mqtt.sendMessage', data: { serverId: 1, topic: 'lamp/set' } },
  { type: 'input.mqtt.message.received', data: { serverId: 1, topic: 'lamp/state' } },
]);

beforeEach(() => {
  state.desktop = true;
  state.mounted = 0;
  state.unmounted = 0;
  state.explorer.mockClear();
});
afterEach(cleanup);

describe('FlowMqttExplorer', () => {
  it('renders nothing while closed', () => {
    const { container } = render(<FlowMqttExplorer isOpen={false} onClose={vi.fn()} mqttNodes={nodes} nodesReady />);
    expect(container.innerHTML).toBe('');
  });

  it('docks beside the canvas from the lg breakpoint instead of opening a modal', () => {
    render(<FlowMqttExplorer isOpen onClose={vi.fn()} mqttNodes={nodes} nodesReady />);
    expect(state.minWidth).toBe(1024);
    expect(DOCKED_MIN_WIDTH).toBe(1024);
    const panel = screen.getByRole('region', { name: 'title' });
    expect(panel.tagName).toBe('ASIDE');
    // Not a dialog: the canvas next to it stays interactive.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(panel.closest('[aria-modal]')).toBeNull();
  });

  it("defaults to the server the flow uses most and suggests that flow's topics", () => {
    render(<FlowMqttExplorer isOpen onClose={vi.fn()} mqttNodes={nodes} nodesReady />);
    expect(screen.getByTestId('explorer').textContent).toBe('1');
    expect(state.explorer).toHaveBeenLastCalledWith({
      mqttServerId: 1,
      topicSuggestions: { filters: ['lamp/set', 'lamp/state'], topics: ['lamp/set', 'lamp/state'] },
      compact: true,
    });
  });

  it('falls back to the first server by name for a flow without MQTT nodes', () => {
    render(<FlowMqttExplorer isOpen onClose={vi.fn()} mqttNodes={[]} nodesReady />);
    expect(screen.getByTestId('explorer').textContent).toBe('2');
  });

  it('waits for the flow to load before picking the default server, as a reload reopens the panel first', () => {
    const { rerender } = render(<FlowMqttExplorer isOpen onClose={vi.fn()} mqttNodes={[]} nodesReady={false} />);
    expect(screen.queryByTestId('explorer')).toBeNull();
    rerender(<FlowMqttExplorer isOpen onClose={vi.fn()} mqttNodes={nodes} nodesReady />);
    expect(screen.getByTestId('explorer').textContent).toBe('1');
  });

  it('switches server on request', () => {
    render(<FlowMqttExplorer isOpen onClose={vi.fn()} mqttNodes={nodes} nodesReady />);
    fireEvent.change(screen.getByLabelText('server'), { target: { value: '2' } });
    expect(screen.getByTestId('explorer').textContent).toBe('2');
  });

  it('does not swap the server when the nodes change while the panel is open', () => {
    const { rerender } = render(<FlowMqttExplorer isOpen onClose={vi.fn()} mqttNodes={[]} nodesReady />);
    expect(screen.getByTestId('explorer').textContent).toBe('2');
    rerender(<FlowMqttExplorer isOpen onClose={vi.fn()} mqttNodes={nodes} nodesReady />);
    expect(screen.getByTestId('explorer').textContent).toBe('2');
  });

  it('closes through the close button and releases the explorer, so reopening starts fresh', () => {
    const onClose = vi.fn();
    const { rerender } = render(<FlowMqttExplorer isOpen onClose={onClose} mqttNodes={nodes} nodesReady />);
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(onClose).toHaveBeenCalledOnce();

    rerender(<FlowMqttExplorer isOpen={false} onClose={onClose} mqttNodes={nodes} nodesReady />);
    expect(state.unmounted).toBe(1);
    expect(screen.queryByTestId('explorer')).toBeNull();

    rerender(<FlowMqttExplorer isOpen onClose={onClose} mqttNodes={nodes} nodesReady />);
    expect(state.mounted).toBe(2);
  });

  it('hands focus back to the toolbar toggle when the docked panel is closed', () => {
    const toggle = document.createElement('button');
    document.body.appendChild(toggle);
    const returnFocusRef = createRef<HTMLElement>();
    (returnFocusRef as { current: HTMLElement | null }).current = toggle;
    try {
      render(
        <FlowMqttExplorer isOpen onClose={vi.fn()} mqttNodes={nodes} nodesReady returnFocusRef={returnFocusRef} />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'close' }));
      expect(document.activeElement).toBe(toggle);
    } finally {
      toggle.remove();
    }
  });

  it('shows a labelled loading status until the default server is known', () => {
    render(<FlowMqttExplorer isOpen onClose={vi.fn()} mqttNodes={[]} nodesReady={false} />);
    expect(screen.getByRole('status', { name: 'loading' })).toBeTruthy();
  });

  it('uses a drawer on narrow screens', () => {
    state.desktop = false;
    render(<FlowMqttExplorer isOpen onClose={vi.fn()} mqttNodes={nodes} nodesReady />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByTestId('explorer')).toBeTruthy();
  });

  it('closes the drawer through its close button', () => {
    state.desktop = false;
    const onClose = vi.fn();
    render(<FlowMqttExplorer isOpen onClose={onClose} mqttNodes={nodes} nodesReady />);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes the drawer when it is dismissed with Escape', () => {
    state.desktop = false;
    const onClose = vi.fn();
    render(<FlowMqttExplorer isOpen onClose={onClose} mqttNodes={nodes} nodesReady />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
