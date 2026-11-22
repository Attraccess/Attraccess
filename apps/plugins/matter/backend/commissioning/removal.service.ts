import type { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SidecarClientError } from '../client/errors';
import { MatterConnectionService } from '../connection/connection.service';
import { DeviceAuditService } from '../devices/audit.service';
import { MatterChangeBus } from '../devices/change-bus';
import type { LifecycleState, MatterNode } from '../devices/entities';
import { markNodeRemoved } from '../devices/mark-removed';
import { MatterReconciliationService } from '../devices/reconciliation.service';
import { conflict } from '../fabric/errors';
import { MatterFabricService } from '../fabric/fabric.service';
import { MatterFabricGuard } from '../fabric/guard';
import { PLUGIN_CONTEXT } from '../plugin-context';
import { matterStorage } from '../plugin-storage/access';
import { failureReason, removalFailure } from './errors';
import { MatterOperationGate } from './operation-gate';
import type { RemoveInput } from './schemas';

const REMOVABLE: LifecycleState[] = ['unclaimed', 'claimed', 'detached', 'archived'];
/** Removal talks to the device (RemoveFabric): longer than the client's default deadline. */
const DEVICE_TIMEOUT_MS = 30_000;
/**
 * After a removal timed out the sidecar keeps waiting for the device for up to 30 s more and, on a late confirmation,
 * forgets the node then. A second reconciliation after that window picks up a removal that completed late.
 */
const LATE_RECONCILIATION_MS = 35_000;

/**
 * Removes a node from the Attraccess fabric. Normal removal sends RemoveFabric for this fabric to the reachable device
 * (other ecosystems' fabrics stay); force removal only makes the sidecar forget the node and never contacts the device.
 * Either way the plugin keeps the record and its history as `removed`. Never a factory reset.
 */
@Injectable()
export class MatterNodeRemovalService {
  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(MatterConnectionService) private readonly connectionService: Pick<MatterConnectionService, 'connection'>,
    @Inject(MatterFabricGuard) private readonly guard: MatterFabricGuard,
    @Inject(DeviceAuditService) private readonly audit: DeviceAuditService,
    @Inject(MatterChangeBus) private readonly changes: MatterChangeBus,
    @Inject(MatterOperationGate) private readonly gate: MatterOperationGate,
    @Inject(MatterFabricService) private readonly fabric: Pick<MatterFabricService, 'detect'>,
    @Inject(MatterReconciliationService) private readonly reconciliation: Pick<MatterReconciliationService, 'request'>,
  ) {}

  private get storage() {
    return matterStorage(this.context);
  }

  async remove(id: string, input: RemoveInput, principal: PluginAuditPrincipal): Promise<MatterNode> {
    this.guard.assertFabricMutationAllowed();
    const { tables } = this.storage;
    const node = await tables.nodes.get(id);
    if (!node) throw new NotFoundException('Unknown Matter node.');
    if (!REMOVABLE.includes(node.lifecycleState)) {
      throw conflict('not_removable', `The node is ${node.lifecycleState} and cannot be removed from the fabric.`);
    }
    const fabric = await tables.fabrics.get(node.fabricRef);
    const release = this.gate.enter('removal');
    try {
      const connection = this.connectionService.connection;
      if (connection.status().state !== 'connected') {
        throw conflict('sidecar_unavailable', 'The Matter sidecar is not connected.');
      }
      const sidecarFabric = await connection.request('fabric.get').catch((error: unknown) => {
        throw removalFailure(error, input.mode);
      });
      if (!fabric || fabric.status !== 'active' || sidecarFabric.fabricId !== fabric.fabricId) {
        throw conflict('fabric_mismatch', "The node does not belong to the sidecar's fabric. Nothing was changed.");
      }
      const generation = await this.removeOnSidecar(node, input.mode, principal);
      return await this.record(node, input.mode, generation, principal);
    } finally {
      release();
    }
  }

  /** `nodes.remove` on the sidecar. A failure is audited; one of uncertain outcome also asks for a reconciliation. */
  private async removeOnSidecar(node: MatterNode, mode: RemoveInput['mode'], principal: PluginAuditPrincipal) {
    try {
      const { fabricGeneration } = await this.connectionService.connection.request('nodes.remove', {
        params: { nodeId: node.nodeId },
        body: { force: mode === 'force' },
        timeoutMs: DEVICE_TIMEOUT_MS,
      });
      return fabricGeneration;
    } catch (error) {
      if (!(error instanceof SidecarClientError)) throw error;
      // The device may still complete the removal: the next reconciliation sees whether it left the fabric.
      if (error.code === 'timeout' || error.outcome === 'uncertain') {
        void this.reconciliation.request().catch(() => undefined);
        setTimeout(() => void this.reconciliation.request().catch(() => undefined), LATE_RECONCILIATION_MS).unref();
      }
      await this.audit.record(
        'matter.node_removal_failed',
        principal,
        subjectOf(node),
        { nodeRef: node.id, mode, reason: failureReason(error) },
        'failed',
      );
      throw removalFailure(error, mode);
    }
  }

  /**
   * The sidecar removed the node: the record follows. The audit entry is written whatever the plugin's own write
   * does, since the fabric changed. A row that is already `removed` counts as done. A write that fails is reported
   * clearly and a reconciliation is asked for, which then finds the node gone from the sidecar.
   */
  private async record(
    node: MatterNode,
    mode: RemoveInput['mode'],
    generation: number,
    principal: PluginAuditPrincipal,
  ): Promise<MatterNode> {
    const force = mode === 'force';
    const now = new Date().toISOString();
    const removal = {
      removedBy: principal.userId,
      removalReason: force ? 'forced_from_fabric' : 'removed_from_fabric',
    } as const;
    let written = false;
    try {
      written = await this.storage.transaction((scoped) => markNodeRemoved(scoped, node.id, REMOVABLE, removal, now));
    } catch (error) {
      this.context.logger.warn?.(
        `The Matter node removed from the fabric could not be marked removed: ${error instanceof Error ? error.name : 'unknown error'}`,
      );
    }
    // The generation advanced because of this action: recorded now, so it is never judged as a mismatch.
    await this.fabric.detect('event').catch(() => undefined);
    this.changes.inventoryChanged();
    const current = await this.storage.tables.nodes.get(node.id).catch(() => null);
    const registryUpdated = written || current?.lifecycleState === 'removed';
    await this.audit.record(
      force ? 'matter.node_force_removed_from_fabric' : 'matter.node_removed_from_fabric',
      principal,
      subjectOf(node),
      { nodeRef: node.id, previousState: node.lifecycleState, fabricGeneration: generation, registryUpdated },
    );
    if (!registryUpdated || !current) {
      void this.reconciliation.request().catch(() => undefined);
      throw new InternalServerErrorException({
        code: 'registry_failed',
        message:
          'The device was removed from the fabric, but its record could not be updated. A reconciliation was ' +
          'requested; it marks the device as missing. Force remove the record if it stays.',
      });
    }
    return current;
  }
}

const subjectOf = (node: MatterNode) => ({ type: 'matter.node' as const, ref: node.id });
