import { WagoEnrollment } from './wago-enrollment.entity';
import { WagoServiceActiveEnrollmentsOperation } from './wago.wago-service-active-enrollments-operation';


export abstract class WagoServiceIsActiveEnrollmentOperation extends WagoServiceActiveEnrollmentsOperation {
  protected isActiveEnrollment(enrollment: WagoEnrollment): boolean {
    return !enrollment.consumedAt && !enrollment.revokedAt && Date.parse(enrollment.expiresAt) > Date.now();
  }
}
