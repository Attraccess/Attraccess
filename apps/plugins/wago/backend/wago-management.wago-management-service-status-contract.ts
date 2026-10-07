import type { ManagementRecord } from './wago-management.types';
import type { ManagementException } from './wago-management.types';
import type { ManagementMode } from './wago-management.types';
import type { ManagementPublicStatus } from './wago-management.types';
import type { SessionCredential } from './wago-management.types';
import { ManagementOwner } from './wago-management.management-owner';
import type { ManagementState } from './wago-management.types';
import type { ManagementTarget } from './wago-management.types';


export abstract class WagoManagementServiceStatusContract {
  abstract status(controllerId: number): Promise<ManagementPublicStatus | null>;
  abstract inspect(
    target: ManagementTarget,
    credential: SessionCredential,
    assertOwned?: () => Promise<void>,
  ): Promise<ManagementPublicStatus>;
  abstract review(
    controllerId: number,
    input: { mode: ManagementMode; exceptions: ManagementException[] },
    assertOwned?: () => Promise<void>,
  ): Promise<ManagementPublicStatus>;
  abstract apply(
    controllerId: number,
    input: { reviewToken: string; confirm: true; temporarySsh: SessionCredential },
    assertOwned?: () => Promise<void>,
  ): Promise<ManagementPublicStatus>;
  protected abstract enforceBaseline(
    record: ManagementRecord,
    owner: ManagementOwner,
    credential: SessionCredential,
    privateKey: string,
  ): Promise<void>;
  abstract recover(
    controllerId: number,
    input: { confirm: true; temporarySsh: SessionCredential },
    assertOwned?: () => Promise<void>,
  ): Promise<ManagementPublicStatus>;
  protected abstract verify(record: ManagementRecord, privateKey: string): Promise<void>;
  protected abstract rollback(
    record: ManagementRecord,
    owner: ManagementOwner,
    credential: SessionCredential,
    failure: ManagementRecord['failure'],
  ): Promise<ManagementPublicStatus>;
  protected abstract step(record: ManagementRecord, owner: ManagementOwner, state: ManagementState): Promise<void>;
  protected abstract save(record: ManagementRecord, owner: ManagementOwner): Promise<void>;
  protected abstract required(controllerId: number): Promise<ManagementRecord>;
  protected abstract locked<T>(
    controllerId: number,
    action: (owner: ManagementOwner) => Promise<T>,
    assertOwned?: () => Promise<void>,
  ): Promise<T>;
}
