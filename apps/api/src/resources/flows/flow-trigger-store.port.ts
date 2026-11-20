import type { FlowEdgeRecord, FlowNodeRecord, FlowResourceRecord } from '@attraccess/application-models';
import type { TransactionContext } from '../../database/transaction-context';

export const FLOW_TRIGGER_STORE = Symbol.for('attraccess.flows.trigger-store');

/** A no-activity trigger node together with a machine that currently has an active session. */
export interface InactivityTarget {
  node: FlowNodeRecord;
  resourceId: number;
}

/**
 * What a flow run reads while it starts and walks the graph: trigger nodes, the edges leaving a node and the node
 * they lead to. A transaction context makes the reads part of the caller's transaction. "Global" nodes are those of
 * enabled global flows; nodes of disabled flows or of other scopes never match.
 */
export interface FlowTriggerStore {
  /** The edges leaving `node` on the canvas it belongs to; `outputHandle` undefined matches every handle. */
  findOutgoingEdges(
    node: FlowNodeRecord,
    outputHandle: string | undefined,
    context?: TransactionContext,
  ): Promise<FlowEdgeRecord[]>;

  /** A node of the same canvas as `node`: edges never lead into another owner's nodes. */
  findNodeOnCanvasOf(
    node: FlowNodeRecord,
    nodeId: string,
    context?: TransactionContext,
  ): Promise<FlowNodeRecord | null>;

  /** Nodes of this type in every resource flow plus those of enabled global flows. */
  findTriggerNodes(type: string, context?: TransactionContext): Promise<FlowNodeRecord[]>;

  /** The nodes of the resource's own flow plus the matching nodes of enabled global flows. */
  findTriggerNodesForResource(
    resourceId: number,
    type: string,
    context?: TransactionContext,
  ): Promise<FlowNodeRecord[]>;

  /**
   * Variable-changed trigger nodes: the nodes of resource flows (only the one resource's when `resourceId` is given)
   * plus those of enabled global flows.
   */
  findVariableTriggerNodes(resourceId: number | null): Promise<FlowNodeRecord[]>;

  /** A button node of the resource's own flow. */
  findButton(resourceId: number, buttonId: string): Promise<FlowNodeRecord | null>;

  /** One page of plugin trigger nodes ordered by id, after `afterNodeId`. */
  findPluginTriggerPage(type: string, afterNodeId: string | undefined, limit: number): Promise<FlowNodeRecord[]>;

  /** Every (no-activity node, machine with an active session) pair: resource-flow and global nodes. */
  findInactivityTargets(): Promise<InactivityTarget[]>;

  /** The resource a run acts on, or null when it no longer exists. */
  findResource(resourceId: number, context?: TransactionContext): Promise<FlowResourceRecord | null>;
}
