import type { ManagementRecord } from './wago-management.types';
import { identifier } from './wago-management.state';
import { WagoManagementServiceRecoverOperation } from './wago-management.wago-management-service-recover-operation';


export abstract class WagoManagementServiceVerifyOperation extends WagoManagementServiceRecoverOperation {
  protected async verify(record: ManagementRecord, privateKey: string): Promise<void> {
    const nonce = identifier(),
      tx = record.transaction!;
    const proof = await this.adapter.verifyKey(tx, privateKey, nonce);
    if (
      proof.nonce !== nonce ||
      !proof.keyOnly ||
      proof.hostKeyFingerprint !== tx.target.hostKeyFingerprint ||
      proof.keyFingerprint !== record.keyFingerprint ||
      !Number.isSafeInteger(proof.uid) ||
      proof.uid <= 0 ||
      proof.uid !== record.inspection!.uid ||
      !proof.managementOperationSucceeded
    )
      throw new Error('verification_failed');
  }
}
