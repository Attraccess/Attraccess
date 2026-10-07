import { WagoServiceCreateEnrollmentOperation } from './wago.service.wago-service-create-enrollment-operation';


export abstract class WagoServiceRevokeEnrollmentByIdOperation extends WagoServiceCreateEnrollmentOperation {
  /** Server-side commissioning revokes the enrollment it created without exposing credentials to a browser. */
  async revokeEnrollmentById(id: number, assertOwned: () => Promise<void> = async () => undefined): Promise<void> {
    const enrollment = await this.enrollments.findOneBy({ id });
    // Expiry limits enrollment use but does not revoke the provisioned broker credential.
    if (enrollment && !enrollment.consumedAt) await this.revokeEnrollment(enrollment, assertOwned);
  }
}
