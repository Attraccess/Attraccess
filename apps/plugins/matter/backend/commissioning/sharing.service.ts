import { SHARE_WINDOW_MIN_SEC } from '@attraccess/matter-contract';
import type { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable, NotFoundException, type OnModuleDestroy } from '@nestjs/common';
import { SidecarClientError } from '../client/errors';
import { MatterConnectionService } from '../connection/connection.service';
import { DeviceAuditService } from '../devices/audit.service';
import type { MatterNode } from '../devices/entities';
import { conflict, forbidden, sidecarFailure } from '../fabric/errors';
import { MatterFabricGuard } from '../fabric/guard';
import { PLUGIN_CONTEXT } from '../plugin-context';
import { matterStorage } from '../plugin-storage/access';
import { failureReason, INSECURE_SHARING_CODE } from './errors';
import { MatterOperationGate } from './operation-gate';
import type { ShareInput } from './schemas';

export type ShareResult = { manualCode: string; qrCode: string; expiresAt: string };

/** Opening and closing a window talks to the device: longer than the client's default deadline. */
const DEVICE_TIMEOUT_MS = 30_000;

/**
 * Shares a commissioned node with another controller by opening a commissioning window on the device. The codes are
 * returned once, in the response: they are never stored, logged, audited or put into an event.
 */
@Injectable()
export class MatterNodeSharingService implements OnModuleDestroy {
  /** Windows this plugin opened and the timers that audit their expiry. Holds no code. */
  private readonly windows = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(MatterConnectionService) private readonly connectionService: Pick<MatterConnectionService, 'connection'>,
    @Inject(MatterFabricGuard) private readonly guard: MatterFabricGuard,
    @Inject(DeviceAuditService) private readonly audit: DeviceAuditService,
    @Inject(MatterOperationGate) private readonly gate: MatterOperationGate,
  ) {}

  onModuleDestroy(): void {
    for (const timer of this.windows.values()) clearTimeout(timer);
    this.windows.clear();
  }

  private async liveNode(id: string) {
    const node = await matterStorage(this.context).tables.nodes.get(id);
    if (!node) throw new NotFoundException('Unknown Matter node.');
    if (node.lifecycleState !== 'claimed' && node.lifecycleState !== 'unclaimed') {
      throw conflict('not_shareable', `The node is ${node.lifecycleState}; only a node in the fabric can be shared.`);
    }
    return node;
  }

  /** The node ID addresses a device in the sidecar's fabric: the node's own fabric must be that one. */
  private async assertSameFabric(node: MatterNode): Promise<void> {
    const fabric = await matterStorage(this.context).tables.fabrics.get(node.fabricRef);
    const sidecarFabric = await this.call(() => this.connectionService.connection.request('fabric.get'));
    if (!fabric || fabric.status !== 'active' || sidecarFabric.fabricId !== fabric.fabricId) {
      throw conflict('fabric_mismatch', "The node does not belong to the sidecar's fabric. Nothing was changed.");
    }
  }

  /** A sidecar call; its contract errors become our own wording. */
  private async call<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      if (error instanceof SidecarClientError) throw this.failure(error);
      throw error;
    }
  }

  async open(id: string, input: ShareInput, principal: PluginAuditPrincipal): Promise<ShareResult> {
    this.guard.assertFabricMutationAllowed();
    const node = await this.liveNode(id);
    const release = this.gate.enter('sharing');
    try {
      // The answer carries the sharing codes: never over plain HTTP from another machine.
      if (this.connectionService.connection.status().insecureTransport) {
        throw forbidden('insecure_transport', INSECURE_SHARING_CODE);
      }
      await this.assertSameFabric(node);
      // Without a choice the sidecar opens the shortest window.
      const timeoutSec = input.timeoutSec ?? SHARE_WINDOW_MIN_SEC;
      const window = await this.call(() =>
        this.connectionService.connection.request('nodes.share.open', {
          params: { nodeId: node.nodeId },
          body: input.timeoutSec === undefined ? {} : { timeoutSec: input.timeoutSec },
          timeoutMs: DEVICE_TIMEOUT_MS,
        }),
      );
      this.track(node.id, window.expiresAt);
      await this.audit.record(
        'matter.node_shared',
        principal,
        { type: 'matter.node', ref: node.id },
        { nodeRef: node.id, timeoutSec },
      );
      return { manualCode: window.manualCode, qrCode: window.qrCode, expiresAt: window.expiresAt };
    } finally {
      release();
    }
  }

  async revoke(id: string, principal: PluginAuditPrincipal): Promise<{ closed: boolean }> {
    this.guard.assertFabricMutationAllowed();
    const node = await this.liveNode(id);
    const release = this.gate.enter('sharing');
    try {
      await this.assertSameFabric(node);
      const { closed } = await this.call(() =>
        this.connectionService.connection.request('nodes.share.revoke', {
          params: { nodeId: node.nodeId },
          body: {},
          timeoutMs: DEVICE_TIMEOUT_MS,
        }),
      );
      clearTimeout(this.windows.get(node.id));
      this.windows.delete(node.id);
      await this.audit.record(
        'matter.node_share_revoked',
        principal,
        { type: 'matter.node', ref: node.id },
        { nodeRef: node.id, closed },
      );
      return { closed };
    } finally {
      release();
    }
  }

  private failure(error: SidecarClientError) {
    if (error.code === 'insecure_transport') return forbidden('insecure_transport', INSECURE_SHARING_CODE);
    if (failureReason(error) === 'device_unreachable') {
      return conflict('device_unreachable', 'The device could not be reached. Nothing was changed.');
    }
    if (failureReason(error) === 'timeout') {
      return conflict(
        'timeout',
        'The device did not answer in time. The window may or may not be open; close it to be sure.',
      );
    }
    return sidecarFailure(error);
  }

  /** Audits the end of the window by itself, as the system. */
  private track(nodeRef: string, expiresAt: string): void {
    clearTimeout(this.windows.get(nodeRef));
    const timer = setTimeout(
      () => {
        this.windows.delete(nodeRef);
        void this.audit.record('matter.node_share_expired', null, { type: 'matter.node', ref: nodeRef }, { nodeRef });
      },
      Math.max(0, Date.parse(expiresAt) - Date.now()),
    );
    timer.unref();
    this.windows.set(nodeRef, timer);
  }
}
