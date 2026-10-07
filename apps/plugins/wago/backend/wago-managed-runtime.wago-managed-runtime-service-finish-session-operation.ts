import { WagoManagedRuntimeServiceEnrolmentWaitReasonOperation } from './wago-managed-runtime.wago-managed-runtime-service-enrolment-wait-reason-operation';


export abstract class WagoManagedRuntimeServiceFinishSessionOperation extends WagoManagedRuntimeServiceEnrolmentWaitReasonOperation {
  protected async finishSession(id: number) {
    await this.sessions.update(id, {
      deliveryToken: null,
      dockerProvisionToken: null,
      dockerProvisionState: null,
      state: 'completed',
      progressStep: 'Controller enrolled',
      progressDetail: 'Permanent runtime verified; encrypted managed SSH credentials retained for automatic updates.',
      failureReason: null,
    });
  }
}
