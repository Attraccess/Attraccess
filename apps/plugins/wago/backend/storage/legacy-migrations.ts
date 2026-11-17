/**
 * Class names of every TypeORM migration the 1.x WAGO plugin shipped, in execution (timestamp) order. A database
 * where all of them are recorded is adopted at storage baseline version 1 without running any DDL.
 */
export const WAGO_LEGACY_MIGRATIONS = [
  'CreateWagoControllers1780000000000',
  'AddWagoEnrollmentRevocation1780000000001',
  'AddWagoConfigurationRevisions1780000000002',
  'AddWagoPresetProvenance1780000000003',
  'AddWagoCommissioningSessions1780000000004',
  'AddWagoCommissioningEnrollment1780000000005',
  'AddWagoCommissioningClaimDetails1780000000006',
  'AddWagoCommissioningProgress1780000000007',
  'AddWagoCommissioningDeliveryToken1780000000008',
  'AddWagoCommissioningPrincipal1780000000009',
  'WagoManagement1780000000010',
  'WagoCommissioningLease1780000000011',
  'AddWagoRevisionEditorMetadata1780010580000',
  'AddWagoClaimIntent1780010600000',
  'WagoCredentialRotation1780010610000',
  'AddWagoRejectionAcknowledgement1780010630000',
  'DropWagoCommissioningLease1780010640000',
  'WagoManagedUpdates1780010650000',
  'WagoNetworkChanges1780010660000',
] as const;
