import { Logger } from '@nestjs/common';

import {
  ExternalEffectFailureBehavior,
  FlowNodeRecord,
  ResourceFlowNodeType,
  getExternalEffectFailureBehavior,
} from '@attraccess/application-models';

import { getPluginFlowNode } from '../../../plugin-system/flows/node-registry';

import type { FlowFailureKind, NodeExecutor } from '../node-executors/index';

export interface NodeFailurePolicy {
  /** `undefined` means the node has no failure policy: its error is rethrown unchanged. */
  behavior: ExternalEffectFailureBehavior | undefined;
  kind: FlowFailureKind;
}

const BEHAVIORS: ReadonlySet<string> = new Set<ExternalEffectFailureBehavior>([
  'fail-flow',
  'failure-output',
  'log-and-continue',
]);

const KINDS: ReadonlySet<string> = new Set<FlowFailureKind>([
  'transport-dispatch',
  'acknowledgement-timeout',
  'controller-rejection',
  'node-failure',
]);

const logger = new Logger('NodeFailurePolicy');

/**
 * How a failed node is handled. Core external-effect nodes read `failureBehavior` from their data; a plugin node
 * opts in through its `getFailureBehavior`/`getFailureKind` hooks and gets the same semantics. A plugin hook that
 * throws or returns an unknown value cannot weaken the policy: the node then fails the flow. A hook returning
 * `undefined` leaves the node without a policy, like a core node without `failureBehavior`.
 */
export function resolveNodeFailurePolicy(
  node: FlowNodeRecord,
  error: unknown,
  executor: NodeExecutor | undefined,
): NodeFailurePolicy {
  if (executor) {
    return {
      behavior: getExternalEffectFailureBehavior(node.type, node.data),
      kind: executor.getFailureKind?.(error) ?? 'node-failure',
    };
  }

  const pluginNode = (Object.values(ResourceFlowNodeType) as string[]).includes(node.type)
    ? undefined
    : getPluginFlowNode(node.type);
  if (!pluginNode || pluginNode.isInput === true) return { behavior: undefined, kind: 'node-failure' };

  return {
    behavior: pluginNode.getFailureBehavior
      ? pluginHook(node, 'getFailureBehavior', BEHAVIORS, 'fail-flow', () =>
          pluginNode.getFailureBehavior?.((node.data ?? {}) as Record<string, unknown>),
        )
      : undefined,
    kind: pluginNode.getFailureKind
      ? (pluginHook(node, 'getFailureKind', KINDS, 'node-failure', () => pluginNode.getFailureKind?.(error)) ??
        'node-failure')
      : 'node-failure',
  };
}

function pluginHook<T extends string>(
  node: FlowNodeRecord,
  hook: string,
  allowed: ReadonlySet<string>,
  fallback: T,
  call: () => string | undefined,
): T | undefined {
  try {
    const value = call();
    if (value === undefined || allowed.has(value)) return value as T | undefined;
    logger.warn(`${node.type}.${hook} returned an unknown value "${String(value)}"`);
  } catch (error) {
    logger.warn(`${node.type}.${hook} threw: ${error instanceof Error ? error.message : String(error)}`);
  }
  return fallback;
}
