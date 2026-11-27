import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  state.owner = { kind: 'resource', resourceId: 7 };
  state.isRecording = false;
  state.fetched = [];
  state.live = [];
  blobs = [];
  fileNames = [];
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    blobs.push(blob as Blob);
    return 'blob:logs';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    fileNames.push(this.download);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const viewer = () => (
  <MemoryRouter>
    <LogViewer confettiEnabled={false} onConfettiEnabledChange={vi.fn()}>
      {(open) => <button onClick={open}>View logs</button>}
    </LogViewer>
  </MemoryRouter>
);

async function open() {
  const user = userEvent.setup();
  const view = render(viewer());
  await user.click(screen.getByText('View logs'));
  return { user, rerender: () => view.rerender(viewer()) };
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
    const { user } = await open();
    await user.click(await downloadButton());
    await user.click(await screen.findByRole('menuitem', { name: 'NDJSON (.ndjson)' }));

    expect(fileNames).toEqual([expect.stringMatching(/^flow-logs-resource-7-\d{8}-\d{6}\.ndjson$/)]);
    expect(blobs[0].type).toBe('application/x-ndjson;charset=utf-8');
    const lines = (await readText(blobs[0])).trimEnd().split('\n');
    expect(lines.map((line) => JSON.parse(line).id)).toEqual([1, 2, 3]);
    expect(JSON.parse(lines[0])).toMatchObject({ nodeType: 'input.button', nodeTitle: 'Button' });
    expect(fetchSpy).not.toHaveBeenCalled();
    // the drawer keeps showing what it showed
    expect(screen.getAllByRole('button', { name: 'Button -> node.processing.started' })).toHaveLength(3);
  });

  it('saves the fetched entries after the recording was stopped', async () => {
    state.isRecording = true;
    state.fetched = [entry(1)];
    const { user, rerender } = await open();
    state.isRecording = false;
    state.fetched = [];
    rerender();
    await user.click(await downloadButton());
    await user.click(await screen.findByRole('menuitem', { name: 'NDJSON (.ndjson)' }));

    const lines = (await readText(blobs[0])).trimEnd().split('\n');
    expect(lines.map((line) => JSON.parse(line).id)).toEqual([1]);
  });

  it('closes an open menu when the recording state changes', async () => {
    state.isRecording = true;
    state.live = [entry(1)];
    const { user, rerender } = await open();
    await user.click(await downloadButton());
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    state.isRecording = false;
    rerender();

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(await downloadButton()).toBeEnabled();
  });

  it('carries the data-cy hooks', async () => {
    state.live = [entry(1)];
    const { user } = await open();
    const trigger = await downloadButton();
    expect(trigger).toHaveAttribute('data-cy', 'flow-log-download');
    await user.click(trigger);
    expect(await screen.findByRole('menuitem', { name: 'NDJSON (.ndjson)' })).toHaveAttribute(
      'data-cy',
      'flow-log-download-ndjson',
    );
    expect(screen.getByRole('menuitem', { name: 'Plain text (.txt)' })).toHaveAttribute(
      'data-cy',
      'flow-log-download-text',
    );
  });

  // React Aria selects and closes the menu on keydown or drag release, so the item never sees a full press.
  it.each(['Enter', ' '])('saves the file while the selecting key (%j) is still held down', async (key) => {
    state.live = [entry(1)];
    const { user } = await open();
    await user.click(await downloadButton());
    (await screen.findByRole('menuitem', { name: 'NDJSON (.ndjson)' })).focus();
    await user.keyboard(`{${key}>}`);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await user.keyboard(`{/${key}}`);

    expect(fileNames).toEqual([expect.stringMatching(/\.ndjson$/)]);
  });

  it('saves the file when the pointer is dragged from the button and released on an item', async () => {
    state.live = [entry(1)];
    const { user } = await open();
    const trigger = await downloadButton();
    await user.pointer({ keys: '[MouseLeft>]', target: trigger });
    const item = await screen.findByRole('menuitem', { name: 'Plain text (.txt)' });
    await user.pointer([{ target: item }, { keys: '[/MouseLeft]', target: item }]);

    expect(fileNames).toEqual([expect.stringMatching(/\.txt$/)]);
  });

  it('saves a global flow as plain text', async () => {
    state.owner = { kind: 'global', flowId: 3 };
    state.live = [entry(1)];
    const { user } = await open();
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
