import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useEffect } from 'react';
import type { ResourceFlowLog } from '@attraccess/react-query-client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LIVE_LOG_FLUSH_MS } from '../liveLogs';
import { FlowProvider, useFlowContext, useFlowLogsContext } from './index';

const state = vi.hoisted(() => ({
  push: undefined as undefined | ((log: ResourceFlowLog) => void),
  keepAlive: vi.fn(),
}));

vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  useGetOneResourceById: () => ({ data: undefined }),
  useGetNodeSchemas: () => ({ data: [], isLoading: false, isError: false }),
  useGetGlobalFlowNodeSchemas: () => ({ data: undefined, isLoading: false, isError: false }),
}));
vi.mock('../../../../../utils/live-updates', () => ({
  useLiveUpdates: (options: { onUpdate: (log: ResourceFlowLog) => void }) => {
    state.push = options.onUpdate;
    return { abort: vi.fn(), owner: null };
  },
}));
vi.mock('../useFlowLogKeepAlive', () => ({
  useFlowLogKeepAlive: (owner: unknown) => {
    state.keepAlive(owner);
    return { isPausedForInactivity: false };
  },
}));

const log = (id: number) => ({ id, flowRunId: 'run', nodeId: 'node', type: 'flow.start' }) as ResourceFlowLog;

const renders = { canvas: 0, viewer: 0 };
const received: number[] = [];
let viewerLogs: ResourceFlowLog[] = [];

function Canvas() {
  renders.canvas += 1;
  const { addLiveLogReceiver, removeLiveLogReceiver } = useFlowContext();
  useEffect(() => {
    const receiver = (entry: ResourceFlowLog) => received.push(entry.id);
    addLiveLogReceiver(receiver);
    return () => removeLiveLogReceiver(receiver);
  }, [addLiveLogReceiver, removeLiveLogReceiver]);
  return null;
}

function Viewer() {
  renders.viewer += 1;
  viewerLogs = useFlowLogsContext().liveLogs;
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  renders.canvas = 0;
  renders.viewer = 0;
  received.length = 0;
  viewerLogs = [];
  state.keepAlive.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function show() {
  return render(
    <FlowProvider owner={{ kind: 'resource', resourceId: 7 }}>
      <Canvas />
      <Viewer />
    </FlowProvider>,
  );
}

it('keeps the recording alive as soon as the editor opens, without the log drawer', () => {
  show();
  expect(state.keepAlive).toHaveBeenCalledWith({ kind: 'resource', resourceId: 7 });
});

it('delivers every entry to live log receivers at once without re-rendering FlowContext consumers', () => {
  show();
  const canvasRenders = renders.canvas;
  const viewerRenders = renders.viewer;

  act(() => {
    for (let id = 1; id <= 20; id += 1) state.push?.(log(id));
  });
  expect(received).toHaveLength(20);

  act(() => vi.advanceTimersByTime(LIVE_LOG_FLUSH_MS));

  expect(viewerLogs.map((entry) => entry.id)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  // One batch: the log viewer renders once, the canvas not at all.
  expect(renders.viewer - viewerRenders).toBe(1);
  expect(renders.canvas).toBe(canvasRenders);
});
