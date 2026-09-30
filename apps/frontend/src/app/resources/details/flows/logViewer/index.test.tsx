import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LogViewer } from './index';
type Log = { id: number; flowRunId: string; nodeId?: string; type: string; createdAt: string; payload?: string };
const state = vi.hoisted(() => ({
  recording: undefined as undefined | { isRecording: boolean; startedAt: string; expiresAt: string },
  logs: [] as Log[],
  live: [] as Log[],
  start: vi.fn(),
  stop: vi.fn(),
  invalidate: vi.fn(),
  startOptions: {} as { onSuccess: () => void },
  stopOptions: {} as { onSuccess: () => void },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({
    t: (key: string, params?: { countdown?: string }) => (params?.countdown ? `${key}:${params.countdown}` : key),
  }),
  useDateTimeFormatter: () => (date: string) => date,
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('../flowContext', () => ({ useFlowContext: () => ({ liveLogs: state.live }) }));
vi.mock('@attraccess/react-query-client', () => ({
  useResourceFlowsServiceGetFlowLogRecordingStatusKey: 'recording',
  useResourceFlowsServiceGetResourceFlow: () => ({
    data: {
      nodes: [
        { id: 'trigger', type: 'timer' },
        { id: 'action', type: 'http' },
      ],
    },
  }),
  useResourceFlowsServiceGetFlowLogRecordingStatus: () => ({ data: state.recording }),
  useResourceFlowsServiceGetResourceFlowLogs: () => ({ data: { logs: state.logs } }),
  useResourceFlowsServiceStartFlowLogRecording: (options: typeof state.startOptions) => {
    state.startOptions = options;
    return { mutate: state.start };
  },
  useResourceFlowsServiceStopFlowLogRecording: (options: typeof state.stopOptions) => {
    state.stopOptions = options;
    return { mutate: state.stop };
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.recording = undefined;
  state.logs = [];
  state.live = [];
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-01T12:00:00Z'));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function open() {
  render(
    <MemoryRouter>
      <LogViewer resourceId={7}>{(open) => <button onClick={open}>View logs</button>}</LogViewer>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText('View logs'));
  await screen.findByText('subtitle');
}
it('starts a recording using the selected duration and refreshes its status', async () => {
  await open();
  expect(screen.getByText('recording.hint')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /recording.duration$/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'duration.h1' }));
  fireEvent.click(screen.getByRole('button', { name: 'recording.start' }));
  expect(state.start).toHaveBeenCalledWith({ resourceId: 7, requestBody: { durationMinutes: 60 } });
  act(() => state.startOptions.onSuccess());
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['recording'] });
});
it('shows the remaining recording duration and stops recording', async () => {
  state.recording = { isRecording: true, startedAt: '2026-09-01T11:00:00Z', expiresAt: '2026-09-01T13:02:03Z' };
  await open();
  expect(screen.getByText('recording.active:1:02:03')).toBeTruthy();
  expect(screen.getByText('recording.waiting')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'recording.stop' }));
  expect(state.stop).toHaveBeenCalledWith({ resourceId: 7 });
  act(() => state.stopOptions.onSuccess());
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['recording'] });
});
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
  expect(screen.getByText('recording.active:05:00')).toBeTruthy();
  expect(screen.queryByText(/OLD/)).toBeNull();
  expect(screen.getAllByRole('button', { name: 'nodes.timer.title -> node.processing.started' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'nodes.timer.title -> node.processing.started' }));
  expect(await screen.findByRole('textbox')).toHaveValue('{\n  "ok": true\n}');
  fireEvent.click(screen.getByRole('button', { name: 'nodes.http.title -> node.processing.finished' }));
  expect(await screen.findByDisplayValue('truncated {')).toBeTruthy();
});
