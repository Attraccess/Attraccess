import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogViewer } from './index';

const state = vi.hoisted(() => ({
  nodes: [] as { id: string; type: string }[],
  schemas: undefined as { type: string; label?: string }[] | undefined,
  logs: [] as { id: number; flowRunId: string; nodeId?: string; type: string; createdAt: string }[],
}));

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('../context/index', () => ({ useFlowContext: () => ({ liveLogs: state.logs }) }));
vi.mock('@attraccess/react-query-client', () => ({
  useResourceFlowsServiceGetResourceFlow: () => ({ data: { nodes: state.nodes } }),
  useResourceFlowsServiceGetNodeSchemas: () => ({ data: state.schemas }),
  useResourceFlowsServiceGetFlowLogRecordingStatus: () => ({ data: { isRecording: false } }),
  useResourceFlowsServiceGetResourceFlowLogs: () => ({ data: { logs: [] } }),
  useResourceFlowsServiceStartFlowLogRecording: () => ({ mutate: vi.fn() }),
  useResourceFlowsServiceStopFlowLogRecording: () => ({ mutate: vi.fn() }),
}));

beforeEach(() => {
  state.nodes = [];
  state.schemas = undefined;
  state.logs = [];
});
afterEach(() => {
  cleanup();
  useTranslationState.getState().setLanguage('en');
});

async function open() {
  render(
    <MemoryRouter>
      <LogViewer resourceId={7} confettiEnabled={false} onConfettiEnabledChange={vi.fn()}>
        {(open) => <button onClick={open}>View logs</button>}
      </LogViewer>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText('View logs'));
  await screen.findByRole('button', { name: /node.processing.started/ });
}

function run(nodeId?: string) {
  state.logs = [
    { id: 1, flowRunId: 'run', type: 'flow.start', createdAt: '2026-09-01T12:00:00Z' },
    { id: 2, flowRunId: 'run', nodeId, type: 'node.processing.started', createdAt: '2026-09-01T12:00:01Z' },
    { id: 3, flowRunId: 'run', nodeId, type: 'node.processing.completed', createdAt: '2026-09-01T12:00:02Z' },
  ];
}

function expectTitle(title: string) {
  expect(screen.getByRole('heading', { name: title })).toBeTruthy();
  expect(screen.getByRole('button', { name: `${title} -> node.processing.started` })).toBeTruthy();
  expect(screen.getByRole('button', { name: `${title} -> node.processing.completed` })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Flow -> flow.start' })).toBeTruthy();
  expect(screen.queryByText(/!!!/)).toBeNull();
}

describe.each(['en', 'de'] as const)('%s node titles', (language) => {
  beforeEach(() => useTranslationState.getState().setLanguage(language));

  it.each([
    ['plugin.wago.event-received', 'WAGO event received'],
    ['plugin.wago.command', 'WAGO command'],
    ['plugin.plugin-hello-world.usage-started', 'Hello World usage started'],
  ])('uses the registered label for %s in entries and the run heading', async (type, label) => {
    state.nodes = [{ id: 'trigger', type }];
    state.schemas = [{ type, label }];
    run('trigger');
    await open();
    expectTitle(label);
  });

  it.each([
    ['input.button', { en: 'Button', de: 'Taste' }],
    ['output.http.sendRequest', { en: 'Send HTTP request', de: 'HTTP-Anfrage senden' }],
  ])('prefers the built-in translation for %s over a schema label', async (type, titles) => {
    state.nodes = [{ id: 'trigger', type }];
    state.schemas = [{ type, label: 'Schema label' }];
    run('trigger');
    await open();
    expectTitle(titles[language]);
  });

  it.each([{ schemas: undefined }, { schemas: [] }, { schemas: [{ type: 'plugin.unknown.node' }] }])(
    'uses the node type when schemas or their label are unavailable (%j)',
    async ({ schemas }) => {
      state.nodes = [{ id: 'trigger', type: 'plugin.unknown.node' }];
      state.schemas = schemas;
      run('trigger');
      await open();
      expectTitle('plugin.unknown.node');
    },
  );

  it.each([undefined, 'deleted-node'])('keeps the generic Flow title for absent nodes (%s)', async (nodeId) => {
    run(nodeId);
    await open();
    expectTitle('Flow');
  });
});
