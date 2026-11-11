import type { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import { ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
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
import { findLive, newCounters, syncNode } from './sync';

type Actor = PluginAuditPrincipal;
const METADATA_FIELDS = ['displayName', 'description', 'location'] as const;

const IDENTITY_COLUMNS = [
  'vendorId',
  'productId',
  'vendorName',
  'productName',
  'serialNumber',
  'uniqueId',
  'hardwareVersion',
  'softwareVersion',
  'softwareVersionString',
  'attestationStatus',
  'attestationCheckedAt',
  'reachable',
  'lastSeenAt',
] as const satisfies readonly (keyof MatterNode)[];

/** Explicit administrator decisions about nodes. Each one is validated, audited, and returns 409 when not allowed. */
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
    const node = await this.require(id);
    const manager = this.nodes.manager;
    const endpoints = await findLive(manager, MatterEndpoint, 'nodeRef', node.id);
    endpoints.sort((a, b) => a.endpointId - b.endpointId);
    const fabric = await manager.getRepository(MatterFabric).findOneBy({ id: node.fabricRef });
    const detailed: {
      endpoint: MatterEndpoint;
      clusters: MatterEndpointCluster[];
      capabilities: MatterEndpointCapability[];
    }[] = [];
    for (const endpoint of endpoints) {
      detailed.push({
        endpoint,
        clusters: await findLive(manager, MatterEndpointCluster, 'endpointRef', endpoint.id),
        capabilities: await manager
          .getRepository(MatterEndpointCapability)
          .find({ where: { endpointRef: endpoint.id } }),
      });
    }
    return { node, fabric, endpoints: detailed };
  }

  async getEndpoint(id: string): Promise<MatterEndpoint> {
    const endpoint = await this.context.getRepository(MatterEndpoint).findOneBy({ id });
    if (!endpoint) throw new NotFoundException('Unknown Matter endpoint.');
    return endpoint;
  }

  // --- actions ---------------------------------------------------------------------------------------------------

  async claim(id: string, input: { displayName?: string }, actor: Actor): Promise<MatterNode> {
    const node = await this.require(id);
    this.expect(node, ['unclaimed'], 'claimed');
    const now = new Date().toISOString();
    node.lifecycleState = 'claimed';
    node.claimedAt = now;
    node.claimedBy = actor.userId;
    node.updatedAt = now;
    if (input.displayName !== undefined) node.displayName = input.displayName;
    await this.nodes.save(node);
    await this.audit.record('matter.node_claimed', actor, nodeSubject(node), {
      nodeRef: node.id,
      nameSet: input.displayName !== undefined,
    });
    return node;
  }

  /**
   * Moves the protocol identity, endpoints, clusters and state of an unclaimed node onto a detached record. The
   * detached record keeps its UUID, names and flow references; the source row stays as `removed`/`merged`.
   */
  async relink(
    id: string,
    input: { sourceNodeId: string; confirmIdentityMismatch?: boolean },
    actor: Actor,
  ): Promise<MatterNode> {
    const target = await this.require(id);
    this.expect(target, ['detached'], 'relinked');
    const source = await this.require(input.sourceNodeId);
    if (source.id === target.id) throw new ConflictException('A node cannot be relinked to itself.');
    if (source.lifecycleState !== 'unclaimed') {
      throw new ConflictException(`The source node must be unclaimed; it is ${source.lifecycleState}.`);
    }
    const mismatch = (['vendorId', 'productId', 'serialNumber'] as const).filter((key) => target[key] !== source[key]);
    if (mismatch.length > 0 && input.confirmIdentityMismatch !== true) {
      throw new ConflictException(
        `The vendor, product or serial number differ (${mismatch.join(', ')}). Send confirmIdentityMismatch: true to relink anyway.`,
      );
    }
    const now = new Date().toISOString();
    await this.nodes.manager.transaction(async (manager) => {
      // The source first: its row stops being live, which frees the (fabric, node) identity for the target.
      const identity = Object.fromEntries(IDENTITY_COLUMNS.map((key) => [key, source[key]]));
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
      target.lifecycleState = 'claimed';
      target.claimedAt ??= now;
      target.claimedBy ??= actor.userId;
      target.detachedReason = null;
      target.detachedAt = null;
      target.updatedAt = now;
      await manager.save(MatterNode, target);
      await this.moveEndpoints(manager, source, target, now);
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
    const node = await this.require(id);
    this.expect(node, ['unclaimed', 'claimed', 'detached'], 'repaired');
    const manager = this.nodes.manager;
    const fabric = await manager.getRepository(MatterFabric).findOneBy({ id: node.fabricRef });
    if (!fabric) throw new ConflictException('The node has no fabric record.');
    const connection = this.connectionService.connection;
    let view;
    try {
      const sidecarFabric = await connection.request('fabric.get');
      if (sidecarFabric.fabricId !== fabric.fabricId) {
        throw new ConflictException('The sidecar runs a different fabric than the one this node belongs to.');
      }
      view = await connection.request('inventory.get', { params: { nodeId: node.nodeId } });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (error instanceof SidecarClientError) {
        if (error.code === 'not_found') throw new ConflictException('The sidecar does not list this node.');
        throw new ServiceUnavailableException(`The Matter sidecar cannot answer right now (${error.code}).`);
      }
      throw error;
    }
    const now = new Date().toISOString();
    let reattached = false;
    await manager.transaction(async (tx) => {
      if (fabric.status !== 'active')
        await tx.update(MatterFabric, { id: fabric.id }, { status: 'active', lastSeenAt: now });
      if (node.lifecycleState === 'detached') {
        node.lifecycleState = node.claimedAt ? 'claimed' : 'unclaimed';
        node.detachedReason = null;
        node.detachedAt = null;
        node.updatedAt = now;
        await tx.save(MatterNode, node);
        reattached = true;
      }
      await syncNode(tx, node, view, now, newCounters());
    });
    await this.audit.record('matter.node_repaired', actor, nodeSubject(node), { nodeRef: node.id, reattached });
    return node;
  }

  async archive(id: string, actor: Actor): Promise<MatterNode> {
    const node = await this.require(id);
    this.expect(node, ['detached', 'unclaimed'], 'archived');
    const previousState = node.lifecycleState as 'detached' | 'unclaimed';
    const now = new Date().toISOString();
    node.lifecycleState = 'archived';
    node.archivedAt = now;
    node.archivedBy = actor.userId;
    node.updatedAt = now;
    await this.nodes.save(node);
    await this.audit.record('matter.node_archived', actor, nodeSubject(node), { nodeRef: node.id, previousState });
    return node;
  }

  /** Back to `detached`; the next reconciliation re-attaches the node if the sidecar still lists it. */
  async restore(id: string, actor: Actor): Promise<MatterNode> {
    const node = await this.require(id);
    this.expect(node, ['archived'], 'restored');
    const now = new Date().toISOString();
    node.lifecycleState = 'detached';
    node.detachedReason = 'absent_from_sidecar';
    node.detachedAt = now;
    node.archivedAt = null;
    node.archivedBy = null;
    node.updatedAt = now;
    await this.nodes.save(node);
    await this.audit.record('matter.node_restored', actor, nodeSubject(node), { nodeRef: node.id });
    return node;
  }

  /**
   * Plugin-side only: the sidecar is not touched. History stays; endpoints are marked removed. A node the sidecar
   * still lists is quarantined again as a new unclaimed record by the next reconciliation.
   */
  async forceRemove(id: string, actor: Actor): Promise<MatterNode> {
    const node = await this.require(id);
    this.expect(node, ['unclaimed', 'claimed', 'detached', 'archived'], 'force-removed');
    const previousState = node.lifecycleState as 'unclaimed' | 'claimed' | 'detached' | 'archived';
    const now = new Date().toISOString();
    await this.nodes.manager.transaction(async (manager) => {
      node.lifecycleState = 'removed';
      node.removedAt = now;
      node.removedBy = actor.userId;
      node.removalReason = 'force_removed';
      node.updatedAt = now;
      await manager.save(MatterNode, node);
      for (const endpoint of await findLive(manager, MatterEndpoint, 'nodeRef', node.id)) {
        endpoint.removedAt = now;
        endpoint.removalReason = 'force_removed';
        await manager.save(MatterEndpoint, endpoint);
        await manager
          .createQueryBuilder()
          .update(MatterEndpointCluster)
          .set({ removedAt: now })
          .where('endpoint_ref = :ref AND removed_at IS NULL', { ref: endpoint.id })
          .execute();
      }
    });
    await this.audit.record('matter.node_force_removed', actor, nodeSubject(node), { nodeRef: node.id, previousState });
    return node;
  }

  // --- metadata --------------------------------------------------------------------------------------------------

  async updateNode(id: string, input: MetadataInput, actor: Actor): Promise<MatterNode> {
    const node = await this.require(id);
    if (node.lifecycleState === 'removed') throw new ConflictException('A removed node cannot be edited.');
    const flags = applyMetadata(node, input);
    if (!flags) return node;
    node.updatedAt = new Date().toISOString();
    await this.nodes.save(node);
    await this.audit.record('matter.node_metadata_updated', actor, nodeSubject(node), { nodeRef: node.id, ...flags });
    return node;
  }

  async updateEndpoint(id: string, input: MetadataInput, actor: Actor): Promise<MatterEndpoint> {
    const endpoint = await this.getEndpoint(id);
    if (endpoint.removedAt !== null) throw new ConflictException('A removed endpoint cannot be edited.');
    const flags = applyMetadata(endpoint, input);
    if (!flags) return endpoint;
    await this.context.getRepository(MatterEndpoint).save(endpoint);
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

  private async require(id: string): Promise<MatterNode> {
    const node = await this.nodes.findOneBy({ id });
    if (!node) throw new NotFoundException('Unknown Matter node.');
    return node;
  }

  private expect(node: MatterNode, allowed: LifecycleState[], verb: string): void {
    if (!allowed.includes(node.lifecycleState)) {
      throw new ConflictException(
        `A ${node.lifecycleState} node cannot be ${verb}; it must be ${allowed.join(' or ')}.`,
      );
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
    const protocolColumns = [
      'parentEndpointId',
      'deviceTypes',
      'profile',
      'bridged',
      'bridgedUniqueId',
      'bridgedNodeLabel',
      'bridgedVendorName',
      'bridgedProductName',
      'bridgedSerialNumber',
      'bridgedReachable',
      'lastSeenAt',
    ] as const satisfies readonly (keyof MatterEndpoint)[];

    const retireTarget = async (endpoint: MatterEndpoint, reason: 'replaced' | 'absent_from_sidecar') => {
      endpoint.removedAt = now;
      endpoint.removalReason = reason;
      await manager.save(MatterEndpoint, endpoint);
      await manager
        .createQueryBuilder()
        .update(MatterEndpointCluster)
        .set({ removedAt: now })
        .where('endpoint_ref = :ref AND removed_at IS NULL', { ref: endpoint.id })
        .execute();
      await manager.delete(MatterEndpointCapability, { endpointRef: endpoint.id });
      await manager.delete(MatterEndpointState, { endpointRef: endpoint.id });
    };

    // Free the endpoint IDs that will be taken over, before anything is moved (live uniqueness per node).
    const moves: { from: MatterEndpoint; to: MatterEndpoint | null }[] = [];
    for (const from of sourceEndpoints) {
      const candidate = targetById.get(from.endpointId) ?? null;
      const sameHardware =
        candidate !== null &&
        (candidate.bridgedUniqueId === null ||
          from.bridgedUniqueId === null ||
          candidate.bridgedUniqueId === from.bridgedUniqueId);
      if (candidate && !sameHardware) await retireTarget(candidate, 'replaced');
      moves.push({ from, to: sameHardware ? candidate : null });
      if (sameHardware && candidate) matched.add(candidate.id);
    }
    for (const endpoint of targetEndpoints) {
      if (!matched.has(endpoint.id) && endpoint.removedAt === null) {
        await retireTarget(endpoint, 'absent_from_sidecar');
      }
    }

    for (const { from, to } of moves) {
      if (!to) {
        // New to the detached record: the source's row (and UUID) moves over as it is.
        from.nodeRef = target.id;
        await manager.save(MatterEndpoint, from);
        continue;
      }
      Object.assign(to, Object.fromEntries(protocolColumns.map((key) => [key, from[key]])));
      await manager.save(MatterEndpoint, to);
      await manager
        .createQueryBuilder()
        .update(MatterEndpointCluster)
        .set({ removedAt: now })
        .where('endpoint_ref = :ref AND removed_at IS NULL', { ref: to.id })
        .execute();
      await manager.delete(MatterEndpointCapability, { endpointRef: to.id });
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
      await manager.save(MatterEndpoint, from);
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
