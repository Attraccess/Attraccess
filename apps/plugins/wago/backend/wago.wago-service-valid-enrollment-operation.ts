import { WagoEnrollment } from './wago-enrollment.entity';
import { hash } from './wago.helpers';
import { WagoServiceMatchesVerifierOperation } from './wago.wago-service-matches-verifier-operation';


export abstract class WagoServiceValidEnrollmentOperation extends WagoServiceMatchesVerifierOperation {
  protected async validEnrollment(
    secret: string,
    serverId: number,
    hardwareId: string,
  ): Promise<WagoEnrollment | null> {
    const enrollment = await this.enrollments.findOneBy({
      secretHash: hash(secret),
      mqttServerId: serverId,
      hardwareId,
    });
    return enrollment && this.isActiveEnrollment(enrollment) ? enrollment : null;
  }
}
