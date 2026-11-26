import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogViewer } from './index';
import { FlowOwner } from '../flowOwner';

const state = vi.hoisted(() => ({
  owner: { kind: 'resource', resourceId: 7 } as FlowOwner,
  isRecording: false,
  fetched: [] as object[],
  live: [] as object[],
}));

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('../context/index', () => ({
  useFlowContext: () => ({ liveLogs: state.live, owner: state.owner }),
}));
vi.mock('@attraccess/react-query-client', () => {
  const canvas = () => ({ data: { nodes: [{ id: 'trigger', type: 'input.button' }] } });
  const status = () => ({
    data: { isRecording: state.isRecording, startedAt: state.isRecording ? '2026-09-01T11:00:00Z' : null },
  });
  const logs = () => ({ data: { logs: state.fetched } });
  const mutation = () => ({ mutate: vi.fn() });
  const none = () => ({ data: undefined });
  return {
    useGetResourceFlow: canvas,
    useGetGlobalFlowCanvas: canvas,
    useGetNodeSchemas: none,
    useGetGlobalFlowNodeSchemas: none,
    useGetFlowLogRecordingStatus: status,
    useGetGlobalFlowLogRecordingStatus: status,
    useGetResourceFlowLogs: logs,
    useGetGlobalFlowLogs: logs,
    useStartFlowLogRecording: mutation,
    useStartGlobalFlowLogRecording: mutation,
    useStopFlowLogRecording: mutation,
    useStopGlobalFlowLogRecording: mutation,
  };
});

let blobs: Blob[];
let fileNames: string[];
const fetchSpy = vi.fn();

beforeEach(() => {
  state.owner = { kind: 'resource', resourceId: 7 };
  state.isRecording = false;
  state.fetched = [];
  state.live = [];
  blobs = [];
  fileNames = [];
  vi.stubGlobal('fetch', fetchSpy);
  URL.createObjectURL = vi.fn((blob: Blob) => {
    blobs.push(blob);
    return 'blob:logs';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    fileNames.push(this.download);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function open() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <LogViewer confettiEnabled={false} onConfettiEnabledChange={vi.fn()}>
        {(open) => <button onClick={open}>View logs</button>}
      </LogViewer>
    </MemoryRouter>,
  );
  await user.click(screen.getByText('View logs'));
  return user;
}

const downloadButton = () => screen.findByRole('button', { name: 'Download' });

function readText(blob: Blob) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

const entry = (id: number) => ({
  id,
  flowRunId: 'run-a',
  nodeId: 'trigger',
  type: 'node.processing.started',
  createdAt: '2026-09-01T11:30:00Z',
});

describe('flow log download', () => {
  it.each([false, true])('is disabled without entries (recording: %s)', async (isRecording) => {
    state.isRecording = isRecording;
    await open();
    expect(await downloadButton()).toBeDisabled();
  });

  it.each([false, true])('is enabled with an entry (recording: %s)', async (isRecording) => {
    state.isRecording = isRecording;
    state.live = [entry(1)];
    await open();
    expect(await downloadButton()).toBeEnabled();
  });

  it('saves the displayed fetched and live entries once each as NDJSON', async () => {
    state.isRecording = true;
    state.fetched = [entry(1), entry(2)];
    state.live = [entry(2), entry(3)];
    const user = await open();
    await user.click(await downloadButton());
    await user.click(await screen.findByRole('menuitem', { name: 'NDJSON (.ndjson)' }));

    expect(fileNames).toEqual([expect.stringMatching(/^flow-logs-resource-7-\d{8}-\d{6}\.ndjson$/)]);
    const lines = (await readText(blobs[0])).trimEnd().split('\n');
    expect(lines.map((line) => JSON.parse(line).id)).toEqual([1, 2, 3]);
    expect(JSON.parse(lines[0])).toMatchObject({ nodeType: 'input.button', nodeTitle: 'Button' });
    expect(fetchSpy).not.toHaveBeenCalled();
    // the drawer keeps showing what it showed
    expect(screen.getAllByRole('button', { name: 'Button -> node.processing.started' })).toHaveLength(3);
  });

  it('saves a global flow as plain text', async () => {
    state.owner = { kind: 'global', flowId: 3 };
    state.live = [entry(1)];
    const user = await open();
    await user.click(await downloadButton());
    await user.click(await screen.findByRole('menuitem', { name: 'Plain text (.txt)' }));

    expect(fileNames).toEqual([expect.stringMatching(/^flow-logs-flow-3-\d{8}-\d{6}\.txt$/)]);
    expect(blobs[0].type).toBe('text/plain;charset=utf-8');
    const text = await readText(blobs[0]);
    expect(text).toContain('Flow: global flow 3\n');
    expect(text).toContain('Entries: 1\n');
    expect(text).toContain('=== Run run-a · Button · 2026-09-01T11:30:00.000Z ===\n');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
