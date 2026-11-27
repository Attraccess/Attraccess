import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourceFlowLog, ResourceFlowNodeDto } from '@attraccess/react-query-client';
import { flowLogFileName, toNdjson, toPlainText } from './flowLogExport';

const node = (id: string, type: string) => ({ id, type, position: { x: 0, y: 0 }, data: {} }) as ResourceFlowNodeDto;
const nodeTitle = (n?: ResourceFlowNodeDto) => (n ? `Title of ${n.type}` : 'Flow');
const log = (id: number, flowRunId: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    flowRunId,
    type: 'node.processing.started',
    createdAt: `2026-09-01T12:00:0${id}+00:00`,
    nodeId: null,
    resourceId: 7,
    flowId: null,
    ...extra,
  }) as ResourceFlowLog & { node?: ResourceFlowNodeDto };

const truncated = '{"a":"xx…[truncated]';
// newest first, as the drawer holds them, with two interleaved runs whose ids sort against their start order
const logs = [
  log(5, 'run-b', { nodeId: 'deleted' }),
  log(4, 'run-z', { nodeId: 'action', node: node('action', 'http'), payload: truncated }),
  log(3, 'run-b', { type: 'flow.start' }),
  log(2, 'run-z', { nodeId: 'trigger', node: node('trigger', 'timer'), payload: '{"ok":true,"list":[1]}' }),
  log(1, 'run-z', { type: 'flow.start' }),
];

describe('toNdjson', () => {
  const output = toNdjson(logs, nodeTitle);
  const entries = output
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line));

  it('writes one line per entry, oldest first, with a final newline and no header', () => {
    expect(output).toMatch(/[^\n]\n$/);
    expect(output).not.toContain('\r');
    expect(entries.map((entry) => entry.id)).toEqual([1, 2, 3, 4, 5]);
    expect(logs.map((entry) => entry.id)).toEqual([5, 4, 3, 2, 1]);
  });

  it('writes all keys, with the node resolved from the canvas', () => {
    expect(entries[1]).toEqual({
      id: 2,
      createdAt: '2026-09-01T12:00:02.000Z',
      flowRunId: 'run-z',
      type: 'node.processing.started',
      nodeId: 'trigger',
      resourceId: 7,
      flowId: null,
      nodeType: 'timer',
      nodeTitle: 'Title of timer',
      payload: { ok: true, list: [1] },
    });
    expect(entries[4]).toMatchObject({ nodeId: 'deleted', nodeType: null, nodeTitle: 'Flow' });
  });

  it('keeps an invalid payload as a string and omits a missing one', () => {
    expect(entries[3].payload).toBe(truncated);
    expect(entries[0]).not.toHaveProperty('payload');
  });

  it('writes createdAt in UTC', () => {
    const [line] = toNdjson([log(1, 'run', { createdAt: '2026-09-01T14:00:00+02:00' })], nodeTitle).split('\n');
    expect(JSON.parse(line).createdAt).toBe('2026-09-01T12:00:00.000Z');
  });

  it('turns absent ids into null', () => {
    const [line] = toNdjson([log(1, 'run', { nodeId: undefined, resourceId: undefined, flowId: 3 })], nodeTitle).split(
      '\n',
    );
    expect(JSON.parse(line)).toMatchObject({ nodeId: null, resourceId: null, flowId: 3 });
  });
});

describe('toPlainText', () => {
  const exportedAt = new Date('2026-09-02T08:00:00Z');

  it('writes the header and the runs in chronological order', () => {
    expect(toPlainText(logs, { owner: { kind: 'resource', resourceId: 7 }, exportedAt, nodeTitle })).toBe(
      [
        'Flow logs',
        'Flow: resource 7',
        'Exported: 2026-09-02T08:00:00.000Z',
        'Entries: 5',
        '',
        '=== Run run-z · Title of timer · 2026-09-01T12:00:01.000Z ===',
        '2026-09-01T12:00:01.000Z  flow.start  Flow',
        '2026-09-01T12:00:02.000Z  node.processing.started  Title of timer (trigger)',
        '    {',
        '      "ok": true,',
        '      "list": [',
        '        1',
        '      ]',
        '    }',
        '2026-09-01T12:00:04.000Z  node.processing.started  Title of http (action)',
        `    ${truncated}`,
        '',
        '=== Run run-b · Flow · 2026-09-01T12:00:03.000Z ===',
        '2026-09-01T12:00:03.000Z  flow.start  Flow',
        '2026-09-01T12:00:05.000Z  node.processing.started  Flow (deleted)',
        '',
      ].join('\n'),
    );
  });

  it('names a global flow in the header', () => {
    expect(toPlainText([], { owner: { kind: 'global', flowId: 3 }, exportedAt, nodeTitle })).toContain(
      'Flow: global flow 3\n',
    );
  });
});

describe('flowLogFileName', () => {
  afterEach(() => vi.unstubAllEnvs());

  // Built from local date parts, so the expectation holds in every time zone.
  const exportedAt = new Date(2026, 0, 2, 3, 4, 5);

  it('uses the owner and the zero-padded local export time', () => {
    expect(flowLogFileName({ kind: 'resource', resourceId: 7 }, exportedAt, 'ndjson')).toBe(
      'flow-logs-resource-7-20260102-030405.ndjson',
    );
    expect(flowLogFileName({ kind: 'global', flowId: 3 }, exportedAt, 'txt')).toBe(
      'flow-logs-flow-3-20260102-030405.txt',
    );
  });

  it('uses local time, not UTC', () => {
    vi.stubEnv('TZ', 'Pacific/Kiritimati');
    expect(flowLogFileName({ kind: 'resource', resourceId: 7 }, new Date('2026-01-01T20:04:05Z'), 'txt')).toBe(
      'flow-logs-resource-7-20260102-100405.txt',
    );
  });
});
