import { WagoServiceRevokeEnrollmentByIdOperation } from './wago.wago-service-revoke-enrollment-by-id-operation';


export abstract class WagoServiceDeleteEnrollmentByIdOperation extends WagoServiceRevokeEnrollmentByIdOperation {
  async deleteEnrollmentById(id: number, assertOwned: () => Promise<void> = async () => undefined): Promise<void> {
    await assertOwned();
    await this.enrollments.delete(id);
  }
}
