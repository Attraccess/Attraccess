import {
  ConflictException,
  NotFoundException
} from '@nestjs/common';
import { WagoController } from './wago-controller.entity';
import type { CommissioningOperationGuard } from './wago-operation-guard';
import { WagoCommissioningServiceRemoveByHardwareIdOperation } from "./wago-commissioning.service.wago-commissioning-service-remove-by-hardware-id-operation";
export abstract class WagoCommissioningServiceOperateControllerSafelyOperation extends WagoCommissioningServiceRemoveByHardwareIdOperation {


  async operateControllerSafely<T>(
    id: number,
    operation: (assertOwned: () => Promise<void>, guard: CommissioningOperationGuard) => Promise<T>,
    requireCommissioningSession = false,
  ): Promise<T> {
    const controller = await this.context.getRepository(WagoController).findOneBy({ id });
    if (!controller) throw new NotFoundException('controller not found');
    const sessions = await this.sessions.find({ where: { hardwareId: controller.hardwareId }, order: { id: 'DESC' } });
    if (!sessions.length) {
      if (requireCommissioningSession)
        throw new ConflictException('A commissioning session must remain pinned while rotating credentials.');
      const controller = new AbortController();
      const guard = {
        assertOwned: async () => {
          if (controller.signal.aborted) throw new ConflictException('Controller operation ended');
        },
        signal: controller.signal,
        deadline: Date.now() + 60_000,
      };
      try {
        return await operation(guard.assertOwned, guard);
      } finally {
        controller.abort();
      }
    }
    return this.withControllerLock(sessions[0].id, async () => {
      const guard = this.operationContext.getStore();
      if (!guard) throw new ConflictException('Controller operation ownership is unavailable.');
      await guard.assertOwned();
      return operation(guard.assertOwned, guard);
    });
  }
}
