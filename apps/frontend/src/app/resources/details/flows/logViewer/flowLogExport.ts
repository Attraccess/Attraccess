import { ResourceFlowLog, ResourceFlowNodeDto } from '@attraccess/react-query-client';
import { FlowOwner } from '../flowOwner';
import { prettyPayload } from './prettyPayload';
import { triggerNodeOfRun } from './triggerNodeOfRun';

type ExportableLog = ResourceFlowLog & { node?: ResourceFlowNodeDto };
type NodeTitle = (node?: ResourceFlowNodeDto) => string;

const oldestFirst = <T extends ExportableLog>(logs: T[]) => [...logs].sort((a, b) => a.id - b.id);
const isoTime = (value: ResourceFlowLog['createdAt']) => new Date(value).toISOString();

function parsePayload(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** One JSON object per entry and line, oldest first. */
export function toNdjson(logs: ExportableLog[], nodeTitle: NodeTitle): string {
  return oldestFirst(logs)
    .map((log) =>
      JSON.stringify({
        id: log.id,
        createdAt: isoTime(log.createdAt),
        flowRunId: log.flowRunId,
        type: log.type,
        nodeId: log.nodeId ?? null,
        resourceId: log.resourceId ?? null,
        flowId: log.flowId ?? null,
        nodeType: log.node?.type ?? null,
        nodeTitle: nodeTitle(log.node),
        // JSON.stringify leaves out undefined, so an entry without payload has no key.
        payload: log.payload ? parsePayload(log.payload) : undefined,
      }),
    )
    .map((line) => `${line}\n`)
    .join('');
}

/** Human readable report grouped by run. Fixed labels stay English whatever the UI language is. */
export function toPlainText(
  logs: ExportableLog[],
  { owner, exportedAt, nodeTitle }: { owner: FlowOwner; exportedAt: Date; nodeTitle: NodeTitle },
): string {
  const runs = new Map<string, ExportableLog[]>();
  for (const log of oldestFirst(logs)) {
    runs.set(log.flowRunId, [...(runs.get(log.flowRunId) ?? []), log]);
  }

  const header = [
    'Flow logs',
    owner.kind === 'resource' ? `Flow: resource ${owner.resourceId}` : `Flow: global flow ${owner.flowId}`,
    `Exported: ${exportedAt.toISOString()}`,
    `Entries: ${logs.length}`,
  ].join('\n');

  const sections = [...runs].map(([runId, logsOfRun]) => {
    const title = nodeTitle(triggerNodeOfRun([...logsOfRun].reverse()));
    const lines = [`=== Run ${runId} · ${title} · ${isoTime(logsOfRun[0].createdAt)} ===`];

    for (const log of logsOfRun) {
      const nodeId = log.nodeId ? ` (${log.nodeId})` : '';
      lines.push(`${isoTime(log.createdAt)}  ${log.type}  ${nodeTitle(log.node)}${nodeId}`);
      if (log.payload) {
        lines.push(
          ...prettyPayload(log.payload)
            .split(/\r?\n/)
            .map((line) => `    ${line}`),
        );
      }
    }

    return lines.join('\n');
  });

  return `${[header, ...sections].join('\n\n')}\n`;
}

export function flowLogFileName(owner: FlowOwner, exportedAt: Date, extension: 'ndjson' | 'txt'): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const date = `${exportedAt.getFullYear()}${pad(exportedAt.getMonth() + 1)}${pad(exportedAt.getDate())}`;
  const time = `${pad(exportedAt.getHours())}${pad(exportedAt.getMinutes())}${pad(exportedAt.getSeconds())}`;
  const flow = owner.kind === 'resource' ? `resource-${owner.resourceId}` : `flow-${owner.flowId}`;

  return `flow-logs-${flow}-${date}-${time}.${extension}`;
}
