import {
  ConflictException,
  NotFoundException
} from '@nestjs/common';
import { WagoCommissioningServiceRevokeOperation } from "./wago-commissioning.service.wago-commissioning-service-revoke-operation";
export abstract class WagoCommissioningServiceRemoveOperation extends WagoCommissioningServiceRevokeOperation {


  async remove(id: number): Promise<void> {
    await this.withControllerLock(id, () =>
      this.withDeliveryLock(id, async () => {
        const session = await this.sessions.findOneBy({ id });
        if (!session) throw new NotFoundException('commissioning session not found');
        if (session.deliveryToken)
          throw new ConflictException('Clean up the retained runtime installation before deleting this session.');
        if (session.dockerProvisionToken)
          throw new ConflictException('Clean up the retained controller preparation before deleting this session.');
        if (await this.managedRuntime?.hasAccess(id))
          throw new ConflictException(
            'Retain this session for audited managed SSH recovery. Re-enrolment creates a fresh management identity.',
          );
        if (session.managementControllerId) {
          const security = await this.management.status(session.managementControllerId);
          if (security && (security.recoveryRequired || ['key_enrolled', 'hardened'].includes(security.state)))
            throw new ConflictException('Recover the saved management access before deleting this session.');
        }
        if (session.enrollmentId !== null) {
          try {
            await this.wago.revokeEnrollmentById(session.enrollmentId, this.operationContext.getStore()?.assertOwned);
            await this.wago.deleteEnrollmentById(session.enrollmentId, this.operationContext.getStore()?.assertOwned);
          } catch {
            throw new ConflictException('Commissioning enrollment removal failed.');
          }
        }
        await this.operationContext.getStore()?.assertOwned();
        await this.sessions.delete(id);
      }),
    );
  }
}
