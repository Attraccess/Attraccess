import { WagoEnrollment } from './wago-enrollment.entity';
import { WagoServiceActiveEnrollmentOperation } from './wago.wago-service-active-enrollment-operation';


export abstract class WagoServiceActiveEnrollmentsOperation extends WagoServiceActiveEnrollmentOperation {
  protected activeEnrollments(): Promise<WagoEnrollment[]> {
    return this.enrollments
      .createQueryBuilder('enrollment')
      .where('enrollment.consumedAt IS NULL')
      .andWhere('enrollment.revokedAt IS NULL')
      .andWhere('enrollment.expiresAt > :now', { now: new Date().toISOString() })
      .getMany();
  }
}
