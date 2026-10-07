import type { ManagementRecord } from './wago-management.types';
import type { SessionCredential } from './wago-management.types';
import { ManagementOwner } from './wago-management.management-owner';
import { WagoManagementServiceApplyOperation } from './wago-management.wago-management-service-apply-operation';


export abstract class WagoManagementServiceEnforceBaselineOperation extends WagoManagementServiceApplyOperation {
  protected async enforceBaseline(
    record: ManagementRecord,
    owner: ManagementOwner,
    credential: SessionCredential,
    privateKey: string,
  ): Promise<void> {
    const tx = record.transaction!;
    await this.step(record, owner, 'restricting_access');
    await this.adapter.restrictAccess(tx, credential, privateKey);
    await this.step(record, owner, 'verifying_baseline');
    // Verify a THIRD fresh key connection after changing policy/reloading the service.
    await this.verify(record, privateKey);
    const result = await this.adapter.verifyBaseline(tx, privateKey);
    if (
      !result.passwordDisabled ||
      !result.defaultAccessDisabled ||
      !result.minimumPrivileges ||
      (!result.wbmSecure && !record.exceptions.includes('wbm_exposed')) ||
      (!result.otherManagementSecure && !record.exceptions.includes('other_services_exposed'))
    )
      throw new Error();
  }
}
