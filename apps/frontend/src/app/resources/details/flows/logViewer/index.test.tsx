import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';
import { LogViewer } from './index';
type Log = { id: number; flowRunId: string; nodeId?: string; type: string; createdAt: string; payload?: string };
const state = vi.hoisted(() => ({
  recording: undefined as undefined | { isRecording: boolean; startedAt: string | null; expiresAt: string | null },
  logs: [] as Log[],
  live: [] as Log[],
  paused: false,
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
    useDateTimeFormatter: () => (date: string) => date,
  }))()),
}));
vi.mock('../context/index', () => ({
  useFlowContext: () => ({ owner: { kind: 'resource', resourceId: 7 } }),
  useFlowLogsContext: () => ({ liveLogs: state.live, isPausedForInactivity: state.paused }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useGetGlobalFlowCanvas: () => ({ data: undefined }),
  useGetGlobalFlowNodeSchemas: () => ({ data: undefined }),
  useGetGlobalFlowLogRecordingStatus: () => ({ data: undefined }),
  useGetGlobalFlowLogs: () => ({ data: undefined }),
  useGetNodeSchemas: () => ({ data: undefined }),
  useGetResourceFlow: () => ({
    data: {
      nodes: [
        { id: 'trigger', type: 'timer' },
        { id: 'action', type: 'http' },
      ],
    },
  }),
  useGetFlowLogRecordingStatus: () => ({ data: state.recording }),
  useGetResourceFlowLogs: () => ({ data: { logs: state.logs } }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.recording = undefined;
  state.logs = [];
  state.live = [];
  state.paused = false;
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-01T12:00:00Z'));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
// Changing version propagates mocked query updates through React Compiler's memoization.
function Viewer({ version = 0 }: { version?: number }) {
  const [confettiEnabled, setConfettiEnabled] = useState(false);
  return (
    <LogViewer confettiEnabled={confettiEnabled} onConfettiEnabledChange={setConfettiEnabled}>
      {(open) => (
        <button data-version={version} onClick={open}>
          View logs
        </button>
      )}
    </LogViewer>
  );
}
async function open() {
  const view = render(
    <MemoryRouter>
      <Viewer />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText('View logs'));
  await screen.findByText('subtitle');
  return view;
}
it('has no recording controls, only the status, download and the confetti toggle', async () => {
  await open();
  const confetti = screen.getByRole('button', { name: 'confetti' });
  expect(confetti).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(confetti);
  expect(confetti).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(confetti);
  expect(confetti).toHaveAttribute('aria-pressed', 'false');
  expect(screen.queryByText(/^recording\.(start|stop|duration|active|hint)$/)).toBeNull();
  expect(screen.queryByRole('button', { name: /recording\./ })).toBeNull();
  expect(screen.getByRole('button', { name: /download.label/ })).toBeTruthy();
});
it('shows "Starting logging…" while the first keep-alive is pending', async () => {
  await open();
  expect(screen.getByText('recording.off')).toBeTruthy();
  expect(screen.getByText('recording.starting')).toBeTruthy();
});
it('shows the recording chip and waits for a run while recording', async () => {
  state.recording = { isRecording: true, startedAt: '2026-09-01T11:00:00Z', expiresAt: '2026-09-01T12:05:00Z' };
  await open();
  expect(screen.getByText('recording.on').closest('[data-cy="flow-log-recording-chip"]')).toBeTruthy();
  expect(screen.getByText('recording.waiting')).toBeTruthy();
});
it.each([
  { isRecording: false, chip: 'recording.off' },
  { isRecording: true, chip: 'recording.on' },
])(
  'says logging is paused once this page timed out (server recording: $isRecording)',
  async ({ isRecording, chip }) => {
    state.paused = true;
    state.recording = { isRecording, startedAt: isRecording ? '2026-09-01T11:00:00Z' : null, expiresAt: null };
    await open();
    expect(screen.getByText(chip)).toBeTruthy();
    expect(screen.getByText('recording.paused')).toBeTruthy();
    expect(screen.queryByText('recording.waiting')).toBeNull();
  },
);
it('merges recorded and live logs once, removes stale runs and exposes formatted payloads', async () => {
  state.recording = { isRecording: true, startedAt: '2026-09-01T11:00:00Z', expiresAt: '2026-09-01T12:05:00Z' };
  const first: Log = {
    id: 1,
    flowRunId: 'run-a',
    nodeId: 'trigger',
    type: 'node.processing.started',
    createdAt: '2026-09-01T11:30:00Z',
    payload: '{"ok":true}',
  };
  state.logs = [
    { id: 0, flowRunId: 'old', type: 'OLD', createdAt: '2026-09-01T10:00:00Z' },
    first,
    {
      id: 2,
      flowRunId: 'run-a',
      nodeId: 'action',
      type: 'node.processing.finished',
      createdAt: '2026-09-01T11:31:00Z',
      payload: 'truncated {',
    },
  ];
  state.live = [first, { id: 3, flowRunId: 'run-b', type: 'flow.start', createdAt: '2026-09-01T11:40:00Z' }];
  await open();
  expect(screen.queryByText(/OLD/)).toBeNull();
  expect(screen.getAllByRole('button', { name: 'nodes.timer.title -> node.processing.started' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'nodes.timer.title -> node.processing.started' }));
  expect(await screen.findByRole('textbox')).toHaveValue('{\n  "ok": true\n}');
  fireEvent.click(screen.getByRole('button', { name: 'nodes.http.title -> node.processing.finished' }));
  expect(await screen.findByDisplayValue('truncated {')).toBeTruthy();
});

it('keeps fetched and live logs visible after the recording expired until the page is unmounted', async () => {
  state.recording = { isRecording: true, startedAt: '2026-09-01T11:00:00Z', expiresAt: '2026-09-01T12:05:00Z' };
  state.logs = [
    {
      id: 1,
      flowRunId: 'run-a',
      nodeId: 'trigger',
      type: 'FETCHED',
      createdAt: '2026-09-01T11:30:00Z',
      payload: '{"ok":true}',
    },
  ];
  state.live = [{ id: 2, flowRunId: 'run-a', nodeId: 'action', type: 'LIVE', createdAt: '2026-09-01T11:31:00Z' }];
  const view = await open();
  expect(screen.getByRole('button', { name: 'nodes.timer.title -> FETCHED' })).toBeTruthy();
  state.recording = { isRecording: false, startedAt: null, expiresAt: null };
  state.logs = [];
  view.rerender(
    <MemoryRouter>
      <Viewer version={1} />
    </MemoryRouter>,
  );
  expect(screen.getByText('recording.off')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'nodes.timer.title -> FETCHED' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'nodes.http.title -> LIVE' })).toBeTruthy();
  expect(screen.queryByText('recording.starting')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'nodes.timer.title -> FETCHED' }));
  expect(await screen.findByRole('textbox')).toHaveValue('{\n  "ok": true\n}');

  view.unmount();
  state.live = [];
  await open();
  expect(screen.queryByRole('button', { name: 'nodes.timer.title -> FETCHED' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'nodes.http.title -> LIVE' })).toBeNull();
  expect(screen.getByText('recording.starting')).toBeTruthy();
});

it('keeps previous recordings and deduplicates logs when recording starts again on the same page', async () => {
  state.recording = { isRecording: true, startedAt: '2026-09-01T11:00:00Z', expiresAt: '2026-09-01T12:05:00Z' };
  const first: Log = { id: 1, flowRunId: 'run-a', nodeId: 'trigger', type: 'FIRST', createdAt: '2026-09-01T11:30:00Z' };
  state.logs = [first];
  state.live = [first];
  const view = await open();
  state.recording = { isRecording: false, startedAt: null, expiresAt: null };
  state.logs = [];
  view.rerender(
    <MemoryRouter>
      <Viewer version={1} />
    </MemoryRouter>,
  );
  state.recording = { isRecording: true, startedAt: '2026-09-01T12:00:00Z', expiresAt: '2026-09-01T12:15:00Z' };
  const second: Log = {
    id: 2,
    flowRunId: 'run-b',
    nodeId: 'action',
    type: 'SECOND',
    createdAt: '2026-09-01T12:00:01Z',
  };
  state.logs = [first, second];
  state.live = [first, second];
  view.rerender(
    <MemoryRouter>
      <Viewer version={2} />
    </MemoryRouter>,
  );
  expect(screen.getAllByRole('button', { name: 'nodes.timer.title -> FIRST' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'nodes.http.title -> SECOND' })).toHaveLength(1);
});
