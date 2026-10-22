/** Coordinator registers this entity and WagoManagement1780000000010. Never return it from an API. */
export interface WagoManagementEntity {
  controllerId: number;
  metadataJson: string | null;
  encryptedPrivateKey: string | null;
  leaseOwner: string | null;
  leaseUntil: number;
}
