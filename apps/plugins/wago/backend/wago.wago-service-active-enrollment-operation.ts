import { WagoEnrollment } from './wago-enrollment.entity';
import { WagoServiceValidEnrollmentOperation } from './wago.wago-service-valid-enrollment-operation';


export abstract class WagoServiceActiveEnrollmentOperation extends WagoServiceValidEnrollmentOperation {
  protected async activeEnrollment(id: number | null): Promise<WagoEnrollment | null> {
    if (!id) return null;
    const enrollment = await this.enrollments.findOneBy({ id });
    return enrollment && this.isActiveEnrollment(enrollment) ? enrollment : null;
  }
}
