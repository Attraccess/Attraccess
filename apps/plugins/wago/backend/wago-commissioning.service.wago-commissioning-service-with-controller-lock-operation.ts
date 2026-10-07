import {
  ConflictException,
  NotFoundException
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { WagoController } from './wago-controller.entity';
import type { CommissioningOperationGuard } from './wago-operation-guard';
import { WagoDeviceOperations } from './wago-device-operations';
import { WagoDeviceOperation } from './wago-managed-access.entity';
import { SSH_TIMEOUT_MS } from "./wago-commissioning.service.ssh-timeout-ms";
import { WagoCommissioningServiceRecoverWhileAuditedOperation } from "./wago-commissioning.service.wago-commissioning-service-recover-while-audited-operation";
export abstract class WagoCommissioningServiceWithControllerLockOperation extends WagoCommissioningServiceRecoverWhileAuditedOperation {


  protected async withControllerLock<T>(id: number, operation: () => Promise<T>): Promise<T> {
    const session = await this.sessions.findOneBy({ id });
    if (!session) throw new NotFoundException('commissioning session not found');
    const key = session.hostKeyFingerprint || session.targetHost || session.hardwareId;
    const previous = this.controllerLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => (release = resolve));
    const queued = previous.then(() => current);
    this.controllerLocks.set(key, queued);
    await previous;
    const controller = new AbortController();
    const deadline = Date.now() + SSH_TIMEOUT_MS;
    let finished = false;
    const guard: CommissioningOperationGuard = {
      signal: controller.signal,
      deadline,
      assertOwned: async () => {
        if (finished || controller.signal.aborted || Date.now() >= deadline)
          throw new ConflictException('Controller operation has stopped. Retry the request.');
      },
    };
    try {
      let deviceOperations: WagoDeviceOperations | undefined;
      const owner = randomBytes(16).toString('hex');
      if (this.managedRuntime) {
        deviceOperations = new WagoDeviceOperations(this.context.getRepository(WagoDeviceOperation));
        if (!(await deviceOperations.acquire(key, owner, Date.now(), deadline + 60_000)))
          throw new ConflictException('Another controller operation is active. Retry after it finishes.');
      }
      const originalAssert = guard.assertOwned;
      guard.assertOwned = async () => {
        await originalAssert();
        await deviceOperations?.assertOwned(key, owner);
      };
      try {
        const enrolled = session.hardwareId
          ? await this.context.getRepository(WagoController).findOneBy({ hardwareId: session.hardwareId })
          : null;
        await this.managedRuntime?.assertNetworkSettled(enrolled?.id ?? null, session.hostKeyFingerprint ?? undefined);
        this.activeDeadlines.set(id, deadline);
        return await this.operationContext.run(guard, operation);
      } finally {
        this.activeDeadlines.delete(id);
        await deviceOperations?.release(key, owner);
      }
    } finally {
      finished = true;
      controller.abort();
      release();
      if (this.controllerLocks.get(key) === queued) this.controllerLocks.delete(key);
    }
  }
}
