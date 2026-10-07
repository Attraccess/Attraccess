import {
  NotFoundException
} from '@nestjs/common';
import { commissioningVerification } from './wago-commissioning-verification';
import { WagoCommissioningServiceListOperation } from "./wago-commissioning.service.wago-commissioning-service-list-operation";
export abstract class WagoCommissioningServiceVerificationOperation extends WagoCommissioningServiceListOperation {


  async verification(id: number) {
    const session = await this.sessions.findOneBy({ id });
    if (!session) throw new NotFoundException('commissioning session not found');
    const settings = this.readiness ? await this.wago.getSettings() : null;
    const runtime = this.readiness?.observe(session.mqttServerId, session.hardwareId, settings.operationalPrefix);
    const verification = await commissioningVerification(this.context, session, runtime);
    const security = session.managementControllerId
      ? await this.management.status(session.managementControllerId)
      : null;
    return {
      ...verification,
      managementHardening: security?.hardened ? 'verified' : (security?.support ?? 'unverified'),
      softwareReady:
        verification.permanentConnection &&
        verification.enrollmentRevoked &&
        verification.configurationApplied &&
        verification.hardwareReadiness === 'ready' &&
        !!security?.hardened,
    };
  }
}
