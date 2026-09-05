import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResourceFlowNodeSchemaDto } from '@attraccess/react-query-client';
import { NodeEditor } from './index';

const mocks = vi.hoisted(() => ({ update: vi.fn(), current: { data: {} as Record<string, unknown> } }));
vi.mock('@xyflow/react', () => ({ useNodeId: () => 'node', useNodesData: () => mocks.current }));
vi.mock('../../flowContext', () => ({ useFlowContext: () => ({ updateNodeData: mocks.update, resourceId: 1 }) }));
vi.mock('../../../../../../api', () => ({ getBaseUrl: () => 'http://localhost' }));
vi.mock('@attraccess/react-query-client', () => ({
  useBillingServiceGetBillingConfiguration: () => ({ data: { minorUnit: 2 } }),
}));
vi.mock('../../../../../../../components/mqttServerSelect', () => ({ MqttServerSelect: () => null }));
vi.mock('../../../../../../../components/companionDeviceSelect', () => ({ CompanionDeviceSelect: () => null }));
vi.mock('../../../../../../mqtt/servers/CreateMqttServerPage', () => ({ CreateMqttServerForm: () => null }));
vi.mock('../../../../../../components/standardDrawer', () => ({
  StandardDrawer: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));

const base: ResourceFlowNodeSchemaDto = {
  type: 'test',
  configSchema: {
    dynamic: true,
    properties: { command: { type: 'string', title: 'Command', refreshesSchema: true, default: 'first' } },
  },
} as ResourceFlowNodeSchemaDto;

function editor(schema = base) {
  return (
    <NodeEditor schema={schema} tNodeTranslations={(key) => key}>
      {(open) => <button onClick={open}>Open</button>}
    </NodeEditor>
  );
}

const pending: Array<(response: Response) => void> = [];
async function respond(index: number, schema = base, ok = true) {
  await act(async () => pending[index]({ ok, json: async () => schema, text: async () => 'failed' } as Response));
}
function submit() {
  const form = screen.getByLabelText('Command').closest('form');
  if (!form) throw new Error('Missing editor form');
  fireEvent.submit(form);
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.update.mockClear();
  mocks.current = { data: {} };
  pending.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve))),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('dynamic node editor', () => {
  it('guards keyboard Enter while pending and saves after resolution', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(editor());
    fireEvent.click(screen.getByText('Open'));
    await user.click(screen.getByLabelText('Command'));
    await user.keyboard('{Enter}');
    expect(mocks.update).not.toHaveBeenCalled();
    await respond(0);
    await user.keyboard('{Enter}');
    expect(mocks.update).toHaveBeenCalledWith('node', { command: 'first' });
  });

  it('sends saved dynamic fields before the full schema is available', async () => {
    mocks.current = { data: { command: 'first', nested: { saved: 'keep' }, removed: 'old' } };
    render(editor());
    fireEvent.click(screen.getByText('Open'));
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string).config.nested).toEqual({ saved: 'keep' });
    await respond(0, {
      ...base,
      configSchema: {
        properties: {
          ...base.configSchema.properties,
          nested: { type: 'object', properties: { saved: { type: 'string' } } },
        },
      },
    });
    submit();
    expect(mocks.update).toHaveBeenCalledWith('node', { command: 'first', nested: { saved: 'keep' } });
  });

  it('blocks submit during initial resolution, debounce, and failure, then retries current values', async () => {
    render(editor());
    fireEvent.click(screen.getByText('Open'));
    submit();
    expect(mocks.update).not.toHaveBeenCalled();
    await respond(0);
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'second' } });
    submit();
    expect(screen.getByText('editor.buttons.save')).toBeDisabled();
    expect(mocks.update).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(300));
    await respond(1, base, false);
    submit();
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Retry'));
    expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]?.body as string)).toEqual({ config: { command: 'second' } });
    await respond(2);
    submit();
    expect(mocks.update).toHaveBeenCalledWith('node', { command: 'second' });
  });

  it('ignores responses after close/reopen, even when fetch ignores abort', async () => {
    render(editor());
    fireEvent.click(screen.getByText('Open'));
    fireEvent.click(screen.getByText('editor.buttons.cancel'));
    fireEvent.click(screen.getByText('Open'));
    await respond(0, { ...base, configSchema: { properties: { stale: { type: 'string', title: 'Stale' } } } });
    expect(screen.queryByLabelText('Stale')).not.toBeInTheDocument();
    submit();
    expect(mocks.update).not.toHaveBeenCalled();
    await respond(1);
    submit();
    expect(mocks.update).toHaveBeenCalledWith('node', { command: 'first' });
  });

  it('ignores old selection results during the next debounce and cancels timers on close', async () => {
    render(editor());
    fireEvent.click(screen.getByText('Open'));
    await respond(0);
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'second' } });
    await act(async () => vi.advanceTimersByTime(300));
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'third' } });
    await respond(1, { ...base, configSchema: { properties: { stale: { type: 'string', title: 'Stale' } } } });
    expect(screen.queryByLabelText('Stale')).not.toBeInTheDocument();
    submit();
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('editor.buttons.cancel'));
    await act(async () => vi.advanceTimersByTime(300));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('invalidates an in-flight request when the schema changes', async () => {
    const view = render(editor());
    fireEvent.click(screen.getByText('Open'));
    const next = { ...base, type: 'next' };
    view.rerender(editor(next));
    await respond(0, { ...base, configSchema: { properties: { stale: { type: 'string', title: 'Stale' } } } });
    expect(screen.queryByLabelText('Stale')).not.toBeInTheDocument();
    await respond(1, next);
    submit();
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it('persists nested defaults and required false values without editing', async () => {
    const schema = {
      ...base,
      configSchema: {
        dynamic: false,
        required: ['enabled', 'nested'],
        properties: {
          command: { type: 'string', title: 'Command', default: 'first' },
          enabled: { type: 'boolean' },
          nested: {
            type: 'object',
            properties: {
              count: { type: 'integer', default: 0 },
              deeper: { type: 'object', properties: { text: { type: 'string', default: 'nested' } } },
            },
          },
          fixed: {
            type: 'string',
            title: 'Fixed',
            default: 'locked',
            readOnly: true,
            description: 'Conflict details\nKeep this value.',
          },
        },
      },
    };
    render(editor(schema));
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByLabelText('Fixed')).toHaveAttribute('readonly');
    submit();
    expect(mocks.update).toHaveBeenCalledWith('node', {
      command: 'first',
      enabled: false,
      nested: { count: 0, deeper: { text: 'nested' } },
      fixed: 'locked',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('blocks incompatible enum values even through form submit', async () => {
    mocks.current = { data: { command: 'first', choice: 'removed' } };
    const schema = {
      ...base,
      configSchema: {
        ...base.configSchema,
        dynamic: false,
        properties: {
          ...base.configSchema.properties,
          choice: { type: 'string', title: 'Choice', enum: ['available'] },
        },
      },
    };
    render(editor(schema));
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByText('Select an available option.')).toBeInTheDocument();
    submit();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
