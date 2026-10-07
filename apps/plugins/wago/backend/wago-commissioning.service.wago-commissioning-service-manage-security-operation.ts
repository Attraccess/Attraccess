import { auditCommissioning, CommissioningPrincipal } from './wago-commissioning-audit';
import type { ManagementMode, ManagementException } from './wago-management.types';
import { TemporarySshCredential } from "./wago-commissioning.service.temporary-ssh-credential";
import { WagoCommissioningServiceManagementStatusOperation } from "./wago-commissioning.service.wago-commissioning-service-management-status-operation";
export abstract class WagoCommissioningServiceManageSecurityOperation extends WagoCommissioningServiceManagementStatusOperation {


  async manageSecurity(
    id: number,
    action: 'inspect' | 'review' | 'apply' | 'recover',
    input: {
      temporarySsh?: TemporarySshCredential;
      mode?: ManagementMode;
      exceptions?: ManagementException[];
      reviewToken?: string;
      confirm?: boolean;
    },
    principal: CommissioningPrincipal | null = null,
  ) {
    return auditCommissioning(
      this.context,
      principal,
      id,
      `security_${action}`,
      () => this.manageSecurityWhileAudited(id, action, input),
      (result) => !result.failure,
    );
  }
}
