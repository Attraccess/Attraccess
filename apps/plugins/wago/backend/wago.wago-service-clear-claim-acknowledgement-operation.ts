import { WagoServiceRevokeEnrollmentOperation } from './wago.wago-service-revoke-enrollment-operation';


export abstract class WagoServiceClearClaimAcknowledgementOperation extends WagoServiceRevokeEnrollmentOperation {
  protected clearClaimAcknowledgement(enrollmentId: number): void {
    this.claimAcknowledgementSubscriptions.get(enrollmentId)?.unsubscribe();
    this.claimAcknowledgementSubscriptions.delete(enrollmentId);
  }
}
