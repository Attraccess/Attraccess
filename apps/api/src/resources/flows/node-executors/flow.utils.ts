import { ResourceType } from '@attraccess/database-entities';
import { FlowExecutionError } from '../errors/flow-execution.error';

/**
 * Shared pure helpers used by both the executor service and individual node
 * executors. Kept side-effect free so they can be unit tested in isolation.
 */

/**
 * MQTT-style topic matching supporting `+` (single level) and `#` (multi level,
 * trailing only) wildcards.
 */
export function topicMatches(filter: string, topic: string): boolean {
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = filter.split('/').map((segment, index, arr) => {
    if (segment === '+') {
      return '[^/]+';
    }
    if (segment === '#' && index === arr.length - 1) {
      return '.*';
    }
    return escapeRegex(segment);
  });
  const pattern = '^' + parts.join('/') + '$';
  return new RegExp(pattern).test(topic);
}

/**
 * Composite key for tracking heartbeat last-seen timestamps per resource +
 * identifier.
 */
export function heartbeatKey(resourceId: number, identifier: string): string {
  return `${resourceId}::${identifier}`;
}

/**
 * Heartbeat key for a beat through a global-flow node. It carries the node id so each global node
 * judges only its own beats, never those of resource flows or other global nodes.
 */
export function globalHeartbeatKey(nodeId: string, resourceId: number, identifier: string): string {
  return `${globalHeartbeatKeyPrefix(nodeId)}${heartbeatKey(resourceId, identifier)}`;
}

export function globalHeartbeatKeyPrefix(nodeId: string): string {
  return `global:${encodeURIComponent(nodeId)}:`;
}

/** Splits a global heartbeat key; undefined for resource-flow keys. */
export function parseGlobalHeartbeatKey(
  key: string,
): { encodedNodeId: string; resourceId: number; identifier: string } | undefined {
  const match = /^global:([^:]*):(\d+)::/.exec(key);
  if (!match) return undefined;
  return { encodedNodeId: match[1], resourceId: Number(match[2]), identifier: key.slice(match[0].length) };
}

interface RunResourceContext {
  resourceId?: number | null;
  getResourceType?(): Promise<ResourceType | undefined>;
}

/** The resource a node acts on: its own in a resource flow, the run's triggering resource in a global flow. */
export function runResourceId(node: { resourceId: number | null }, ctx: RunResourceContext): number | null {
  return node.resourceId ?? ctx.resourceId ?? null;
}

/** Like `runResourceId`, but a run without a triggering resource is a node error. */
export function requireRunResourceId(node: { resourceId: number | null }, ctx: RunResourceContext): number {
  const resourceId = runResourceId(node, ctx);
  if (resourceId === null) {
    throw new FlowExecutionError(
      'This node acts on a resource, but the run has no triggering resource (it was not started by a resource event)',
    );
  }
  return resourceId;
}

/** Like `requireRunResourceId`, and in a global flow the triggering resource must also be a machine. */
export async function requireRunMachineId(
  node: { resourceId: number | null },
  ctx: RunResourceContext,
): Promise<number> {
  const resourceId = requireRunResourceId(node, ctx);
  if (node.resourceId === null) {
    const type = await ctx.getResourceType?.();
    if (type !== undefined && type !== ResourceType.Machine) {
      throw new FlowExecutionError(`This node only works for machines, but the triggering resource is a ${type}`);
    }
  }
  return resourceId;
}
