import type { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import { ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { In, type EntityManager } from 'typeorm';
import { SidecarClientError } from '../client/errors';
import { MatterConnectionService } from '../connection/connection.service';
import { PLUGIN_CONTEXT } from '../plugin-context';
import { DeviceAuditService } from './audit.service';
import {
  MatterCommand,
  MatterEndpoint,
  MatterEndpointCapability,
  MatterEndpointCluster,
  MatterEndpointState,
  MatterFabric,
  MatterNode,
  type LifecycleState,
} from './entities';
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
 * Every check-then-write runs inside `runSerialized` on freshly read rows, so a reconciliation or another
 * administrator in between can neither be overwritten nor slip past the state check.
 */
@Injectable()
export class MatterLifecycleService {
  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(MatterConnectionService) private readonly connectionService: MatterConnectionService,
    @Inject(DeviceAuditService) private readonly audit: DeviceAuditService,
  ) {}

  private get nodes() {
    return this.context.getRepository(MatterNode);
  }

  // --- reads -----------------------------------------------------------------------------------------------------

  async listNodes(filter: { lifecycleState?: LifecycleState; includeInactive?: boolean }): Promise<MatterNode[]> {
    const query = this.nodes.createQueryBuilder('n').orderBy('n.createdAt', 'ASC').addOrderBy('n.nodeId', 'ASC');
    if (filter.lifecycleState) query.where('n.lifecycleState = :state', { state: filter.lifecycleState });
    else if (!filter.includeInactive) query.where(`n.lifecycleState NOT IN ('archived', 'removed')`);
    return query.getMany();
  }

  async getNode(id: string) {
    const manager = this.nodes.manager;
    const node = await this.require(manager, id);
    const endpoints = await findLive(manager, MatterEndpoint, 'nodeRef', node.id);
    endpoints.sort((a, b) => a.endpointId - b.endpointId);
    const fabric = await manager.getRepository(MatterFabric).findOneBy({ id: node.fabricRef });
    const refs = endpoints.map((endpoint) => endpoint.id);
    const [clusters, capabilities] =
      refs.length === 0
        ? [[], []]
        : await Promise.all([
            manager
              .createQueryBuilder(MatterEndpointCluster, 'c')
              .where('c.endpointRef IN (:...refs) AND c.removedAt IS NULL', { refs })
              .getMany(),
            manager.findBy(MatterEndpointCapability, { endpointRef: In(refs) }),
          ]);
    const detailed = endpoints.map((endpoint) => ({
      endpoint,
      clusters: clusters.filter((cluster) => cluster.endpointRef === endpoint.id),
      capabilities: capabilities.filter((capability) => capability.endpointRef === endpoint.id),
    }));
    return { node, fabric, endpoints: detailed };
  }

  async getEndpoint(id: string): Promise<MatterEndpoint> {
    const endpoint = await this.context.getRepository(MatterEndpoint).findOneBy({ id });
    if (!endpoint) throw new NotFoundException('Unknown Matter endpoint.');
    return endpoint;
  }

  // --- actions ---------------------------------------------------------------------------------------------------

  async claim(id: string, input: { displayName?: string }, actor: Actor): Promise<MatterNode> {
    const node = await this.context.runSerialized(async (manager) => {
      const node = await this.require(manager, id);
      this.expect(node, ['unclaimed'], 'claimed');
      const now = new Date().toISOString();
      node.lifecycleState = 'claimed';
      node.claimedAt = now;
      node.claimedBy = actor.userId;
      node.updatedAt = now;
      if (input.displayName !== undefined) node.displayName = input.displayName;
      await manager.save(MatterNode, node);
      return node;
    });
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
    const { target, source, mismatch } = await this.context.runSerialized(async (manager) => {
      const target = await this.require(manager, id);
      this.expect(target, ['detached'], 'relinked');
      const source = await manager.findOneBy(MatterNode, { id: input.sourceNodeId });
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
      source.lifecycleState = 'removed';
      source.removedAt = now;
      source.removedBy = actor.userId;
      source.removalReason = 'merged';
      source.mergedInto = target.id;
      source.updatedAt = now;
      await manager.save(MatterNode, source);

      Object.assign(target, identity, { fabricRef: sourceFabricRef, nodeId: sourceNodeId });
      target.lifecycleState = reattachedState(target);
      target.detachedReason = null;
      target.detachedAt = null;
      target.updatedAt = now;
      await manager.save(MatterNode, target);
      await this.moveEndpoints(manager, source, target, now);
      return { target, source, mismatch };
    });
    await this.audit.record('matter.node_relinked', actor, nodeSubject(target), {
      nodeRef: target.id,
      sourceNodeRef: source.id,
      identityMismatchConfirmed: mismatch.length > 0,
    });
    return target;
  }

  /** Re-reads one node from the sidecar. Changes nothing when the sidecar cannot answer. */
  async repair(id: string, actor: Actor): Promise<MatterNode> {
    const before = await this.require(this.nodes.manager, id);
    this.expect(before, ['unclaimed', 'claimed', 'detached'], 'repaired');
    const fabric = await this.nodes.manager.findOneBy(MatterFabric, { id: before.fabricRef });
    if (!fabric) throw new ConflictException('The node has no fabric record.');
    // Sidecar I/O stays outside the serialized transaction.
    const view = await this.readFromSidecar(fabric, before.nodeId);
    const { node, reattached } = await this.context.runSerialized(async (manager) => {
      const node = await this.require(manager, id);
      this.expect(node, ['unclaimed', 'claimed', 'detached'], 'repaired');
      if (node.fabricRef !== fabric.id || node.nodeId !== before.nodeId) {
        throw new ConflictException('The node changed while it was read from the sidecar. Nothing was changed.');
      }
      const current = await manager.findOneBy(MatterFabric, { id: fabric.id });
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
        node.lifecycleState = reattachedState(node);
        node.detachedReason = null;
        node.detachedAt = null;
        node.updatedAt = now;
        await manager.save(MatterNode, node);
        reattached = true;
      }
      await syncNode(manager, node, view, now, newCounters());
      return { node, reattached };
    });
    await this.audit.record('matter.node_repaired', actor, nodeSubject(node), { nodeRef: node.id, reattached });
    return node;
  }

  async archive(id: string, actor: Actor): Promise<MatterNode> {
    let previousState: 'detached' | 'unclaimed' = 'detached';
    const node = await this.context.runSerialized(async (manager) => {
      const node = await this.require(manager, id);
      this.expect(node, ['detached', 'unclaimed'], 'archived');
      previousState = node.lifecycleState as 'detached' | 'unclaimed';
      const now = new Date().toISOString();
      // `detached_reason` stays, so a restore keeps a fabric mismatch from being re-attached by itself.
      node.lifecycleState = 'archived';
      node.archivedAt = now;
      node.archivedBy = actor.userId;
      node.updatedAt = now;
      await manager.save(MatterNode, node);
      return node;
    });
    await this.audit.record('matter.node_archived', actor, nodeSubject(node), { nodeRef: node.id, previousState });
    return node;
  }

  /**
   * Back to `detached`; the next reconciliation re-attaches the node if the sidecar still lists it. A node detached
   * by a fabric mismatch keeps that reason, so only repair or relink bring it back.
   */
  async restore(id: string, actor: Actor): Promise<MatterNode> {
    const node = await this.context.runSerialized(async (manager) => {
      const node = await this.require(manager, id);
      this.expect(node, ['archived'], 'restored');
      const now = new Date().toISOString();
      const fabric = await manager.findOneBy(MatterFabric, { id: node.fabricRef });
      node.lifecycleState = 'detached';
      // A node archived while unclaimed has no reason yet. If its fabric is no longer the sidecar's, it belongs to a
      // fabric mismatch like its siblings and must not be re-attached by itself either.
      node.detachedReason =
        node.detachedReason ?? (fabric?.status === 'active' ? 'absent_from_sidecar' : 'fabric_mismatch');
      node.detachedAt = now;
      node.archivedAt = null;
      node.archivedBy = null;
      node.updatedAt = now;
      await manager.save(MatterNode, node);
      return node;
    });
    await this.audit.record('matter.node_restored', actor, nodeSubject(node), { nodeRef: node.id });
    return node;
  }

  /**
   * Plugin-side only: the sidecar is not touched. History stays; endpoints are marked removed. A node the sidecar
   * still lists is quarantined again as a new unclaimed record by the next reconciliation.
   */
  async forceRemove(id: string, actor: Actor): Promise<MatterNode> {
    let previousState: 'unclaimed' | 'claimed' | 'detached' | 'archived' = 'detached';
    const node = await this.context.runSerialized(async (manager) => {
      const node = await this.require(manager, id);
      this.expect(node, ['unclaimed', 'claimed', 'detached', 'archived'], 'force-removed');
      previousState = node.lifecycleState as typeof previousState;
      const now = new Date().toISOString();
      node.lifecycleState = 'removed';
      node.removedAt = now;
      node.removedBy = actor.userId;
      node.removalReason = 'force_removed';
      node.updatedAt = now;
      await manager.save(MatterNode, node);
      for (const endpoint of await findLive(manager, MatterEndpoint, 'nodeRef', node.id)) {
        await retireEndpoint(manager, endpoint, 'force_removed', now);
      }
      return node;
    });
    await this.audit.record('matter.node_force_removed', actor, nodeSubject(node), { nodeRef: node.id, previousState });
    return node;
  }

  // --- metadata --------------------------------------------------------------------------------------------------

  async updateNode(id: string, input: MetadataInput, actor: Actor): Promise<MatterNode> {
    const { node, flags } = await this.context.runSerialized(async (manager) => {
      const node = await this.require(manager, id);
      if (node.lifecycleState === 'removed') throw new ConflictException('A removed node cannot be edited.');
      const flags = applyMetadata(node, input);
      if (!flags) return { node, flags };
      node.updatedAt = new Date().toISOString();
      await manager.update(
        MatterNode,
        { id: node.id },
        {
          displayName: node.displayName,
          description: node.description,
          location: node.location,
          updatedAt: node.updatedAt,
        },
      );
      return { node, flags };
    });
    if (!flags) return node;
    await this.audit.record('matter.node_metadata_updated', actor, nodeSubject(node), { nodeRef: node.id, ...flags });
    return node;
  }

  async updateEndpoint(id: string, input: MetadataInput, actor: Actor): Promise<MatterEndpoint> {
    const { endpoint, flags } = await this.context.runSerialized(async (manager) => {
      const endpoint = await manager.findOneBy(MatterEndpoint, { id });
      if (!endpoint) throw new NotFoundException('Unknown Matter endpoint.');
      if (endpoint.removedAt !== null) throw new ConflictException('A removed endpoint cannot be edited.');
      const flags = applyMetadata(endpoint, input);
      if (flags) {
        await manager.update(
          MatterEndpoint,
          { id: endpoint.id },
          { displayName: endpoint.displayName, description: endpoint.description, location: endpoint.location },
        );
      }
      return { endpoint, flags };
    });
    if (!flags) return endpoint;
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

  private async require(manager: EntityManager, id: string): Promise<MatterNode> {
    const node = await manager.findOneBy(MatterNode, { id });
    if (!node) throw new NotFoundException('Unknown Matter node.');
    return node;
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
    manager: EntityManager,
    source: MatterNode,
    target: MatterNode,
    now: string,
  ): Promise<void> {
    const sourceEndpoints = await findLive(manager, MatterEndpoint, 'nodeRef', source.id);
    const targetEndpoints = await findLive(manager, MatterEndpoint, 'nodeRef', target.id);
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
      if (candidate && !sameHardware) await retireEndpoint(manager, candidate, 'replaced', now);
      moves.push({ from, to: sameHardware ? candidate : null });
      if (sameHardware && candidate) matched.add(candidate.id);
    }
    for (const endpoint of targetEndpoints) {
      if (!matched.has(endpoint.id) && endpoint.removedAt === null) {
        await retireEndpoint(manager, endpoint, 'absent_from_sidecar', now);
      }
    }

    for (const { from, to } of moves) {
      if (!to) {
        // New to the detached record: the source's row (and UUID) moves over as it is.
        from.nodeRef = target.id;
        await manager.update(MatterEndpoint, { id: from.id }, { nodeRef: target.id });
        continue;
      }
      Object.assign(to, Object.fromEntries(ENDPOINT_PROTOCOL_COLUMNS.map((key) => [key, from[key]])));
      await manager.save(MatterEndpoint, to);
      await manager
        .createQueryBuilder()
        .update(MatterEndpointCluster)
        .set({ removedAt: now })
        .where('endpoint_ref = :ref AND removed_at IS NULL', { ref: to.id })
        .execute();
      await manager.delete(MatterEndpointCapability, { endpointRef: to.id });
      // The current state comes from the source, the node the sidecar reports now. The target's rows describe
      // the hardware as the old fabric last saw it; one row per state key, so those are replaced.
      await manager.delete(MatterEndpointState, { endpointRef: to.id });
      await manager
        .createQueryBuilder()
        .update(MatterEndpointCluster)
        .set({ endpointRef: to.id })
        .where('endpoint_ref = :ref AND removed_at IS NULL', { ref: from.id })
        .execute();
      await manager.update(MatterEndpointCapability, { endpointRef: from.id }, { endpointRef: to.id });
      await manager.update(MatterEndpointState, { endpointRef: from.id }, { endpointRef: to.id });
      await manager.update(MatterCommand, { endpointRef: from.id }, { endpointRef: to.id });
      from.removedAt = now;
      from.removalReason = 'merged';
      await manager.update(MatterEndpoint, { id: from.id }, { removedAt: now, removalReason: 'merged' });
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
