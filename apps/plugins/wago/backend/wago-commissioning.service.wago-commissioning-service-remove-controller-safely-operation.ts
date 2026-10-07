import {
  ConflictException,
  NotFoundException
} from '@nestjs/common';
import { WagoController } from './wago-controller.entity';
import { WagoCommissioningServiceOperateControllerSafelyOperation } from "./wago-commissioning.service.wago-commissioning-service-operate-controller-safely-operation";
export abstract class WagoCommissioningServiceRemoveControllerSafelyOperation extends WagoCommissioningServiceOperateControllerSafelyOperation {


  /** The HTTP audit wrapper belongs inside remove(), so removal is audited once by ATT-983. */
  async removeControllerSafely(
    id: number,
    remove: (assertOwned: () => Promise<void>) => Promise<string>,
  ): Promise<void> {
    const controller = await this.context.getRepository(WagoController).findOneBy({ id });
    if (!controller) throw new NotFoundException('controller not found');
    const sessions = await this.sessions.find({ where: { hardwareId: controller.hardwareId }, order: { id: 'DESC' } });
    if (!sessions.length) {
      await remove(async () => undefined);
      return;
    }
    await this.withControllerLock(sessions[0].id, async () => {
      const guard = this.operationContext.getStore();
      if (!guard) throw new ConflictException('Controller operation ownership is unavailable.');
      const assertOwned = guard.assertOwned;
      await assertOwned();
      await this.managedRuntime?.assertRemovable(id);
      const hardwareId = await remove(assertOwned);
      await this.managedRuntime?.retire(id);
      for (const candidate of await this.sessions.find({ where: { hardwareId } })) {
        await this.withDeliveryLock(candidate.id, async () => {
          const session = await this.sessions.findOneBy({ id: candidate.id });
          if (!session) return;
          await this.revokeSessionEnrollment(session);
          if (session.managementControllerId) {
            const security = await this.management.status(session.managementControllerId);
            if (!security || (!security.recoveryRequired && !['key_enrolled', 'hardened'].includes(security.state)))
              session.managementControllerId = null;
          }
          if (
            session.deliveryToken ||
            session.dockerProvisionToken ||
            session.managementControllerId ||
            (await this.managedRuntime?.hasAccess(session.id))
          ) {
            session.state = 'revoked';
            session.pairingCode = null;
            session.progressStep = 'Controller registration removed';
            session.progressDetail =
              'Credentials revoked. Retained runtime, Docker and management recovery remain available; removal did not uninstall the controller runtime.';
            await this.save(session, 'controller_removed_recovery_retained');
          } else {
            await assertOwned();
            await this.sessions.delete(session.id);
          }
        });
      }
    });
  }
}
