import type { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SidecarClientError } from '../client/errors';
import { MatterConnectionService } from '../connection/connection.service';
import { PLUGIN_CONTEXT } from '../plugin-context';
import { matterStorage, type MatterTables } from '../plugin-storage/access';
import { DeviceAuditService } from './audit.service';
import { MatterChangeBus } from './change-bus';
import type { LifecycleState, MatterEndpoint, MatterFabric, MatterNode } from './entities';
import type { MetadataInput } from './schemas';
import type { NodeView } from './sidecar-types';
import {
  ENDPOINT_PROTOCOL_COLUMNS,
  NODE_IDENTITY_COLUMNS,
  findLive,
  newCounters,
  reattachedState,
  retireEndpoint,
  syncNode,
} from './sync';

type Actor = PluginAuditPrincipal;
const METADATA_FIELDS = ['displayName', 'description', 'location'] as const;

/**
 * Explicit administrator decisions about nodes. Each one is validated, audited, and returns 409 when not allowed.
 * Every check-then-write runs in one host transaction on freshly read rows, and each state change is a compare-and-set
 * on the state that was checked, so a reconciliation or another administrator in between can neither be overwritten
 * nor slip past the state check.
 */
@Injectable()
export class MatterLifecycleService {
  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(MatterConnectionService) private readonly connectionService: MatterConnectionService,
    @Inject(DeviceAuditService) private readonly audit: DeviceAuditService,
    @Optional() @Inject(MatterChangeBus) private readonly changes?: MatterChangeBus,
  ) {}

  private get storage() {
    return matterStorage(this.context);
  }

  // --- reads -----------------------------------------------------------------------------------------------------

  async listNodes(filter: { lifecycleState?: LifecycleState; includeInactive?: boolean }): Promise<MatterNode[]> {
    const where = filter.lifecycleState
      ? { lifecycleState: filter.lifecycleState }
      : filter.includeInactive
        ? undefined
        : { lifecycleState: { notIn: ['archived', 'removed'] as LifecycleState[] } };
    return this.storage.tables.nodes.find({
      where,
      orderBy: [{ field: 'createdAt' }, { field: 'nodeId' }],
    });
  }

  async getNode(id: string) {
    const { tables } = this.storage;
    const node = await this.require(tables, id);
    const endpoints = await findLive(tables.endpoints, 'nodeRef', node.id);
    endpoints.sort((a, b) => a.endpointId - b.endpointId);
    const fabric = await tables.fabrics.get(node.fabricRef);
    const refs = endpoints.map((endpoint) => endpoint.id);
    // One query per table for all endpoints of the node, never one per endpoint.
    const [clusters, capabilities] =
      refs.length === 0
        ? [[], []]
        : await Promise.all([
            tables.endpointClusters.find({ where: { endpointRef: { in: refs }, removedAt: null } }),
            tables.endpointCapabilities.find({ where: { endpointRef: { in: refs } } }),
          ]);
    const detailed = endpoints.map((endpoint) => ({
      endpoint,
      clusters: clusters.filter((cluster) => cluster.endpointRef === endpoint.id),
      capabilities: capabilities.filter((capability) => capability.endpointRef === endpoint.id),
    }));
    return { node, fabric, endpoints: detailed };
  }

  async getEndpoint(id: string): Promise<MatterEndpoint> {
    const endpoint = await this.storage.tables.endpoints.get(id);
    if (!endpoint) throw new NotFoundException('Unknown Matter endpoint.');
    return endpoint;
  }

  // --- actions ---------------------------------------------------------------------------------------------------

  async claim(id: string, input: { displayName?: string }, actor: Actor): Promise<MatterNode> {
    const node = await this.storage.transaction(async (tables) => {
      const node = await this.require(tables, id);
      this.expect(node, ['unclaimed'], 'claimed');
      const now = new Date().toISOString();
      await this.transition(tables, node, ['unclaimed'], {
        lifecycleState: 'claimed',
        claimedAt: now,
        claimedBy: actor.userId,
        updatedAt: now,
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      });
      return node;
    });
    this.changes?.inventoryChanged();
    await this.audit.record('matter.node_claimed', actor, nodeSubject(node), {
      nodeRef: node.id,
      nameSet: input.displayName !== undefined,
    });
    return node;
  }

  /**
   * Moves the protocol identity, endpoints, clusters and state of an unclaimed node onto a detached record. The
   * detached record keeps its UUID, names and flow references; the source row stays as `removed`/`merged`. The
   * record returns to the state it had before it was detached: claimed if it ever was, unclaimed otherwise.
   */
  async relink(
    id: string,
    input: { sourceNodeId: string; confirmIdentityMismatch?: boolean },
    actor: Actor,
  ): Promise<MatterNode> {
    const { target, source, mismatch } = await this.storage.transaction(async (tables) => {
      const target = await this.require(tables, id);
      this.expect(target, ['detached'], 'relinked');
      const source = await tables.nodes.get(input.sourceNodeId);
      if (!source) throw new NotFoundException('Unknown source node (sourceNodeId).');
      if (source.id === target.id) throw new ConflictException('A node cannot be relinked to itself.');
      if (source.lifecycleState !== 'unclaimed') {
        throw new ConflictException(`The source node must be unclaimed; it is ${source.lifecycleState}.`);
      }
      const mismatch = (['vendorId', 'productId', 'serialNumber'] as const).filter(
        (key) => target[key] !== source[key],
      );
      if (mismatch.length > 0 && input.confirmIdentityMismatch !== true) {
        throw new ConflictException(
          `The vendor, product or serial number differ (${mismatch.join(', ')}). Send confirmIdentityMismatch: true to relink anyway.`,
        );
      }
      const now = new Date().toISOString();
      // The source first: its row stops being live, which frees the (fabric, node) identity for the target.
      const identity = Object.fromEntries(NODE_IDENTITY_COLUMNS.map((key) => [key, source[key]]));
      const sourceFabricRef = source.fabricRef;
      const sourceNodeId = source.nodeId;
      await this.transition(tables, source, ['unclaimed'], {
        lifecycleState: 'removed',
        removedAt: now,
        removedBy: actor.userId,
        removalReason: 'merged',
        mergedInto: target.id,
        updatedAt: now,
      });

      // The target takes the source's identity; the state it returns to is decided on the target as it is.
      await this.transition(tables, target, ['detached'], {
        ...identity,
        fabricRef: sourceFabricRef,
        nodeId: sourceNodeId,
        lifecycleState: reattachedState(target),
        detachedReason: null,
        detachedAt: null,
        updatedAt: now,
      });
      await this.moveEndpoints(tables, source, target, now);
      return { target, source, mismatch };
    });
    this.changes?.inventoryChanged();
    await this.audit.record('matter.node_relinked', actor, nodeSubject(target), {
      nodeRef: target.id,
      sourceNodeRef: source.id,
      identityMismatchConfirmed: mismatch.length > 0,
    });
    return target;
  }

  /** Re-reads one node from the sidecar. Changes nothing when the sidecar cannot answer. */
  async repair(id: string, actor: Actor): Promise<MatterNode> {
    const before = await this.require(this.storage.tables, id);
    this.expect(before, ['unclaimed', 'claimed', 'detached'], 'repaired');
    const fabric = await this.storage.tables.fabrics.get(before.fabricRef);
    if (!fabric) throw new ConflictException('The node has no fabric record.');
    // Sidecar I/O stays outside the transaction.
    const view = await this.readFromSidecar(fabric, before.nodeId);
    const { node, reattached } = await this.storage.transaction(async (tables) => {
      const node = await this.require(tables, id);
      this.expect(node, ['unclaimed', 'claimed', 'detached'], 'repaired');
      if (node.fabricRef !== fabric.id || node.nodeId !== before.nodeId) {
        throw new ConflictException('The node changed while it was read from the sidecar. Nothing was changed.');
      }
      const current = await tables.fabrics.get(fabric.id);
      if (current?.status !== 'active') {
        // Another fabric may still be active here: run a reconciliation first, which settles the fabrics, so events
        // can never reach a node of the wrong fabric.
        throw new ConflictException(
          "The node's fabric is not the active one. Run a reconciliation first. Nothing was changed.",
        );
      }
      const now = new Date().toISOString();
      let reattached = false;
      if (node.lifecycleState === 'detached') {
        await this.transition(tables, node, ['detached'], {
          lifecycleState: reattachedState(node),
          detachedReason: null,
          detachedAt: null,
          updatedAt: now,
        });
        reattached = true;
      }
      await syncNode(tables, node, view, now, newCounters());
      return { node, reattached };
    });
    this.changes?.inventoryChanged();
    await this.audit.record('matter.node_repaired', actor, nodeSubject(node), { nodeRef: node.id, reattached });
    return node;
  }

  async archive(id: string, actor: Actor): Promise<MatterNode> {
    let previousState: 'detached' | 'unclaimed' = 'detached';
    const node = await this.storage.transaction(async (tables) => {
      const node = await this.require(tables, id);
      this.expect(node, ['detached', 'unclaimed'], 'archived');
      previousState = node.lifecycleState as 'detached' | 'unclaimed';
      const now = new Date().toISOString();
      // `detached_reason` stays, so a restore keeps a fabric mismatch from being re-attached by itself.
      await this.transition(tables, node, ['detached', 'unclaimed'], {
        lifecycleState: 'archived',
        archivedAt: now,
        archivedBy: actor.userId,
        updatedAt: now,
      });
      return node;
    });
    this.changes?.inventoryChanged();
    await this.audit.record('matter.node_archived', actor, nodeSubject(node), { nodeRef: node.id, previousState });
    return node;
  }

  /**
   * Back to `detached`; the next reconciliation re-attaches the node if the sidecar still lists it. A node detached
   * by a fabric mismatch keeps that reason, so only repair or relink bring it back.
   */
  async restore(id: string, actor: Actor): Promise<MatterNode> {
    const node = await this.storage.transaction(async (tables) => {
      const node = await this.require(tables, id);
      this.expect(node, ['archived'], 'restored');
      const now = new Date().toISOString();
      const fabric = await tables.fabrics.get(node.fabricRef);
      await this.transition(tables, node, ['archived'], {
        lifecycleState: 'detached',
        // A node archived while unclaimed has no reason yet. If its fabric is no longer the sidecar's, it belongs to a
        // fabric mismatch like its siblings and must not be re-attached by itself either.
        detachedReason:
          node.detachedReason ?? (fabric?.status === 'active' ? 'absent_from_sidecar' : 'fabric_mismatch'),
        detachedAt: now,
        archivedAt: null,
        archivedBy: null,
        updatedAt: now,
      });
      return node;
    });
    this.changes?.inventoryChanged();
    await this.audit.record('matter.node_restored', actor, nodeSubject(node), { nodeRef: node.id });
    return node;
  }

  /**
   * Plugin-side only: the sidecar is not touched. History stays; endpoints are marked removed. A node the sidecar
   * still lists is quarantined again as a new unclaimed record by the next reconciliation.
   */
  async forceRemove(id: string, actor: Actor): Promise<MatterNode> {
    let previousState: 'unclaimed' | 'claimed' | 'detached' | 'archived' = 'detached';
    const node = await this.storage.transaction(async (tables) => {
      const node = await this.require(tables, id);
      this.expect(node, ['unclaimed', 'claimed', 'detached', 'archived'], 'force-removed');
      previousState = node.lifecycleState as typeof previousState;
      const now = new Date().toISOString();
      await this.transition(tables, node, ['unclaimed', 'claimed', 'detached', 'archived'], {
        lifecycleState: 'removed',
        removedAt: now,
        removedBy: actor.userId,
        removalReason: 'force_removed',
        updatedAt: now,
      });
      for (const endpoint of await findLive(tables.endpoints, 'nodeRef', node.id)) {
        await retireEndpoint(tables, endpoint, 'force_removed', now);
      }
      return node;
    });
    this.changes?.inventoryChanged();
    await this.audit.record('matter.node_force_removed', actor, nodeSubject(node), { nodeRef: node.id, previousState });
    return node;
  }

  // --- metadata --------------------------------------------------------------------------------------------------

  async updateNode(id: string, input: MetadataInput, actor: Actor): Promise<MatterNode> {
    const { node, flags } = await this.storage.transaction(async (tables) => {
      const node = await this.require(tables, id);
      if (node.lifecycleState === 'removed') throw new ConflictException('A removed node cannot be edited.');
      const flags = applyMetadata(node, input);
      if (!flags) return { node, flags };
      node.updatedAt = new Date().toISOString();
      const changed = await tables.nodes.update(
        { id: node.id, lifecycleState: { ne: 'removed' } },
        {
          displayName: node.displayName,
          description: node.description,
          location: node.location,
          updatedAt: node.updatedAt,
        },
      );
      if (changed === 0) throw new ConflictException('A removed node cannot be edited.');
      return { node, flags };
    });
    if (!flags) return node;
    this.changes?.inventoryChanged();
    await this.audit.record('matter.node_metadata_updated', actor, nodeSubject(node), { nodeRef: node.id, ...flags });
    return node;
  }

  async updateEndpoint(id: string, input: MetadataInput, actor: Actor): Promise<MatterEndpoint> {
    const { endpoint, flags } = await this.storage.transaction(async (tables) => {
      const endpoint = await tables.endpoints.get(id);
      if (!endpoint) throw new NotFoundException('Unknown Matter endpoint.');
      if (endpoint.removedAt !== null) throw new ConflictException('A removed endpoint cannot be edited.');
      const flags = applyMetadata(endpoint, input);
      if (flags) {
        await tables.endpoints.update(
          { id: endpoint.id },
          { displayName: endpoint.displayName, description: endpoint.description, location: endpoint.location },
        );
      }
      return { endpoint, flags };
    });
    if (!flags) return endpoint;
    this.changes?.inventoryChanged();
    await this.audit.record(
      'matter.endpoint_metadata_updated',
      actor,
      { type: 'matter.endpoint', ref: endpoint.id },
      {
        endpointRef: endpoint.id,
        endpointId: endpoint.endpointId,
        ...flags,
      },
    );
    return endpoint;
  }

  // --- helpers ---------------------------------------------------------------------------------------------------

  private async require(tables: MatterTables, id: string): Promise<MatterNode> {
    const node = await tables.nodes.get(id);
    if (!node) throw new NotFoundException('Unknown Matter node.');
    return node;
  }

  /**
   * Writes `patch` to the node, compare-and-set on the lifecycle state the caller checked: another writer that moved
   * the node first makes this fail with 409 instead of being overwritten. The in-memory node follows the patch.
   */
  private async transition(
    tables: MatterTables,
    node: MatterNode,
    allowed: LifecycleState[],
    patch: Partial<MatterNode>,
  ): Promise<void> {
    const changed = await tables.nodes.update({ id: node.id, lifecycleState: { in: allowed } }, patch);
    if (changed === 0) throw new ConflictException('The node changed in the meantime. Nothing was changed.');
    Object.assign(node, patch);
  }

  private expect(node: MatterNode, allowed: LifecycleState[], verb: string): void {
    if (!allowed.includes(node.lifecycleState)) {
      throw new ConflictException(
        `The node is ${node.lifecycleState}. Only a node that is ${allowed.join(' or ')} can be ${verb}.`,
      );
    }
  }

  /** The node as the sidecar reports it now, or a 409/503 that changes nothing. */
  private async readFromSidecar(fabric: MatterFabric, nodeId: string): Promise<NodeView> {
    const connection = this.connectionService.connection;
    try {
      const sidecarFabric = await connection.request('fabric.get');
      if (sidecarFabric.fabricId !== fabric.fabricId) {
        throw new ConflictException(
          sidecarFabric.fabricId === null
            ? 'The sidecar has no fabric. Nothing was changed.'
            : 'The sidecar runs a different fabric than the one this node belongs to. Nothing was changed.',
        );
      }
      return await connection.request('inventory.get', { params: { nodeId } });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (error instanceof SidecarClientError) {
        if (error.code === 'not_found') {
          throw new ConflictException('The sidecar does not report this node right now. Nothing was changed.');
        }
        if (error.code === 'unsupported_capability') {
          throw new ServiceUnavailableException(
            'This Matter sidecar release cannot read nodes yet (unsupported_capability). Nothing was changed.',
          );
        }
        throw new ServiceUnavailableException(
          `The Matter sidecar cannot answer right now (${error.code}). Nothing was changed.`,
        );
      }
      throw error;
    }
  }

  /** Moves the source node's endpoints onto the target, matched by endpoint ID (and bridged unique ID when known). */
  private async moveEndpoints(
    tables: MatterTables,
    source: MatterNode,
    target: MatterNode,
    now: string,
  ): Promise<void> {
    const sourceEndpoints = await findLive(tables.endpoints, 'nodeRef', source.id);
    const targetEndpoints = await findLive(tables.endpoints, 'nodeRef', target.id);
    const targetById = new Map(targetEndpoints.map((endpoint) => [endpoint.endpointId, endpoint]));
    const matched = new Set<string>();

    // Free the endpoint IDs that will be taken over, before anything is moved (live uniqueness per node).
    const moves: { from: MatterEndpoint; to: MatterEndpoint | null }[] = [];
    for (const from of sourceEndpoints) {
      const candidate = targetById.get(from.endpointId) ?? null;
      const sameHardware =
        candidate !== null &&
        (candidate.bridgedUniqueId === null ||
          from.bridgedUniqueId === null ||
          candidate.bridgedUniqueId === from.bridgedUniqueId);
      if (candidate && !sameHardware) await retireEndpoint(tables, candidate, 'replaced', now);
      moves.push({ from, to: sameHardware ? candidate : null });
      if (sameHardware && candidate) matched.add(candidate.id);
    }
    for (const endpoint of targetEndpoints) {
      if (!matched.has(endpoint.id) && endpoint.removedAt === null) {
        await retireEndpoint(tables, endpoint, 'absent_from_sidecar', now);
      }
    }

    for (const { from, to } of moves) {
      if (!to) {
        // New to the detached record: the source's row (and UUID) moves over as it is.
        from.nodeRef = target.id;
        await tables.endpoints.update({ id: from.id }, { nodeRef: target.id });
        continue;
      }
      await tables.endpoints.update(
        { id: to.id },
        Object.fromEntries(ENDPOINT_PROTOCOL_COLUMNS.map((key) => [key, from[key]])),
      );
      await tables.endpointClusters.update({ endpointRef: to.id, removedAt: null }, { removedAt: now });
      await tables.endpointCapabilities.delete({ endpointRef: to.id });
      // The current state comes from the source, the node the sidecar reports now. The target's rows describe
      // the hardware as the old fabric last saw it; one row per state key, so those are replaced.
      await tables.endpointState.delete({ endpointRef: to.id });
      await tables.endpointClusters.update({ endpointRef: from.id, removedAt: null }, { endpointRef: to.id });
      await tables.endpointCapabilities.update({ endpointRef: from.id }, { endpointRef: to.id });
      await tables.endpointState.update({ endpointRef: from.id }, { endpointRef: to.id });
      await tables.commands.update({ endpointRef: from.id }, { endpointRef: to.id });
      from.removedAt = now;
      from.removalReason = 'merged';
      await tables.endpoints.update({ id: from.id }, { removedAt: now, removalReason: 'merged' });
    }
  }
}

const nodeSubject = (node: MatterNode) => ({ type: 'matter.node' as const, ref: node.id });

/** Applies the given fields; returns the changed-flags, or null when nothing differs. */
function applyMetadata(
  target: { displayName: string | null; description: string | null; location: string | null },
  input: MetadataInput,
): { displayNameChanged: boolean; descriptionChanged: boolean; locationChanged: boolean } | null {
  const flags = { displayNameChanged: false, descriptionChanged: false, locationChanged: false };
  for (const field of METADATA_FIELDS) {
    const value = input[field];
    if (value === undefined || value === target[field]) continue;
    target[field] = value;
    flags[`${field}Changed`] = true;
  }
  return Object.values(flags).some(Boolean) ? flags : null;
}
