import type { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SidecarClientError } from '../client/errors';
import { MatterConnectionService } from '../connection/connection.service';
import { DeviceAuditService } from '../devices/audit.service';
import { MatterChangeBus } from '../devices/change-bus';
import type { LifecycleState, MatterNode } from '../devices/entities';
import { findLive, retireEndpoint } from '../devices/sync';
import { conflict } from '../fabric/errors';
import { MatterFabricService } from '../fabric/fabric.service';
import { MatterFabricGuard } from '../fabric/guard';
import { PLUGIN_CONTEXT } from '../plugin-context';
import { matterStorage } from '../plugin-storage/access';
import { failureReason, removalFailure } from './errors';
import { MatterOperationGate } from './operation-gate';
import type { RemoveInput } from './schemas';

const REMOVABLE: LifecycleState[] = ['unclaimed', 'claimed', 'detached', 'archived'];

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
    const subject = { type: 'matter.node' as const, ref: node.id };
    const force = input.mode === 'force';
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
      let generation: number;
      try {
        ({ fabricGeneration: generation } = await connection.request('nodes.remove', {
          params: { nodeId: node.nodeId },
          body: { force },
        }));
      } catch (error) {
        if (error instanceof SidecarClientError) {
          await this.audit.record(
            'matter.node_removal_failed',
            principal,
            subject,
            {
              nodeRef: node.id,
              mode: input.mode,
              reason: failureReason(error),
            },
            'failed',
          );
          throw removalFailure(error, input.mode);
        }
        throw error;
      }
      const previousState = node.lifecycleState;
      const now = new Date().toISOString();
      await this.storage.transaction(async (scoped) => {
        const changed = await scoped.nodes.update(
          { id: node.id, lifecycleState: { in: REMOVABLE } },
          {
            lifecycleState: 'removed',
            removedAt: now,
            removedBy: principal.userId,
            removalReason: force ? 'forced_from_fabric' : 'removed_from_fabric',
            updatedAt: now,
          },
        );
        if (changed === 0) throw conflict('not_removable', 'The node changed in the meantime.');
        // The endpoints are history now; their state, commands and the node's audit trail stay.
        for (const endpoint of await findLive(scoped.endpoints, 'nodeRef', node.id)) {
          await retireEndpoint(scoped, endpoint, 'absent_from_sidecar', now);
        }
      });
      // The generation advanced because of this action: recorded now, so it is never judged as a mismatch.
      await this.fabric.detect('event').catch(() => undefined);
      this.changes.inventoryChanged();
      await this.audit.record(
        force ? 'matter.node_force_removed_from_fabric' : 'matter.node_removed_from_fabric',
        principal,
        subject,
        { nodeRef: node.id, previousState, fabricGeneration: generation },
      );
      const removed = await this.storage.tables.nodes.get(node.id);
      return removed as MatterNode;
    } finally {
      release();
    }
  }
}
