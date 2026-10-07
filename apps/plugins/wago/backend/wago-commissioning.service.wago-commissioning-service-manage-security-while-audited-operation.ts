import {
  ConflictException,
  NotFoundException
} from '@nestjs/common';
import { WagoController } from './wago-controller.entity';
import { ManagementError } from './wago-management';
import type { ManagementMode, ManagementException } from './wago-management.types';
import { TemporarySshCredential } from "./wago-commissioning.service.temporary-ssh-credential";
import { WagoCommissioningServiceManageSecurityOperation } from "./wago-commissioning.service.wago-commissioning-service-manage-security-operation";
export abstract class WagoCommissioningServiceManageSecurityWhileAuditedOperation extends WagoCommissioningServiceManageSecurityOperation {


  protected async manageSecurityWhileAudited(
    id: number,
    action: 'inspect' | 'review' | 'apply' | 'recover',
    input: {
      temporarySsh?: TemporarySshCredential;
      mode?: ManagementMode;
      exceptions?: ManagementException[];
      reviewToken?: string;
      confirm?: boolean;
    },
  ) {
    return this.withControllerLock(id, () =>
      this.withDeliveryLock(id, async () => {
        const session = await this.sessions.findOneBy({ id });
        if (!session) throw new NotFoundException('commissioning session not found');
        if (
          ['awaiting_identity_confirmation', 'delivering'].includes(session.state) ||
          (session.state === 'revoked' && action !== 'recover')
        )
          throw new ConflictException('Confirm controller identity and finish delivery before management changes.');
        if (!session.managementControllerId) {
          const controller = await this.context
            .getRepository(WagoController)
            .findOneBy({ hardwareId: session.hardwareId, mqttServerId: session.mqttServerId });
          if (!controller) throw new ConflictException('Wait for controller enrollment before management inspection.');
          session.managementControllerId = controller.id;
          await this.save(session, 'management_subject_bound');
        }
        const subject = session.managementControllerId;
        try {
          if (action === 'inspect')
            return await this.management.inspect(
              { controllerId: subject, host: session.targetHost, hostKeyFingerprint: session.hostKeyFingerprint },
              input.temporarySsh,
              this.operationContext.getStore()?.assertOwned,
            );
          if (action === 'review')
            return await this.management.review(
              subject,
              { mode: input.mode, exceptions: input.exceptions },
              this.operationContext.getStore()?.assertOwned,
            );
          if (action === 'apply')
            return await this.management.apply(
              subject,
              {
                reviewToken: input.reviewToken,
                confirm: input.confirm as true,
                temporarySsh: input.temporarySsh,
              },
              this.operationContext.getStore()?.assertOwned,
            );
          return await this.management.recover(
            subject,
            {
              confirm: input.confirm as true,
              temporarySsh: input.temporarySsh,
            },
            this.operationContext.getStore()?.assertOwned,
          );
        } catch (error) {
          throw new ConflictException(
            error instanceof ManagementError
              ? `Management security: ${error.code}`
              : 'Management security request failed.',
          );
        }
      }),
    );
  }
}
