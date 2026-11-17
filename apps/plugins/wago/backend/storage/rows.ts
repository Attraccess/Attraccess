import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { wagoTables } from './tables';
import type { TypedRow, TypedTableApi } from './typed';

export type WagoTrustState = 'untrusted' | 'claimed';

export type WagoConfigurationRevisionState = 'pending' | 'published' | 'applied' | 'rejected';

export type WagoCommissioningState =
  | 'awaiting_delivery'
  | 'delivering'
  | 'awaiting_identity_confirmation'
  | 'awaiting_codesys_confirmation'
  | 'delivery_failed'
  | 'awaiting_discovery'
  | 'awaiting_claim'
  | 'awaiting_verification'
  | 'claim_interrupted'
  | 'recovery_revocation_pending'
  | 'completed'
  | 'revoked';

export type WagoManagedAccessState = 'pending' | 'verified' | 'managed' | 'recovery_required' | 'retiring' | 'retired';

export type WagoCredentialRotationPhase = 'provisioning' | 'pending' | 'completed';

export type WagoNetworkChangePhase = 'connecting' | 'provisioning' | 'applying' | 'verifying' | 'saving' | 'completed';

type Tables = typeof wagoTables;

/** Closed vocabularies of string columns, per table. */
interface Vocabulary {
  controllers: { trustState: WagoTrustState };
  configurationRevisions: { state: WagoConfigurationRevisionState };
  commissioningSessions: { state: WagoCommissioningState };
  managedAccess: { state: WagoManagedAccessState };
  credentialRotations: { phase: WagoCredentialRotationPhase };
  networkChanges: { phase: WagoNetworkChangePhase };
}

type VocabularyOf<K extends keyof Tables> = K extends keyof Vocabulary ? Vocabulary[K] : object;

/** The record port of every WAGO table. */
export type WagoStorage = { readonly [K in keyof Tables]: TypedTableApi<Tables[K], VocabularyOf<K>> };

type RowOf<K extends keyof Tables> = TypedRow<Tables[K], VocabularyOf<K>>;

export type WagoControllerRow = RowOf<'controllers'>;
export type WagoSettingsRow = RowOf<'settings'>;
export type WagoEnrollmentRow = RowOf<'enrollments'>;
export type WagoConfigurationDraftRow = RowOf<'configurationDrafts'>;
export type WagoConfigurationRevisionRow = RowOf<'configurationRevisions'>;
export type WagoCommissioningSessionRow = RowOf<'commissioningSessions'>;
export type WagoManagedAccessRow = RowOf<'managedAccess'>;
export type WagoRuntimeUpdateRow = RowOf<'runtimeUpdates'>;
export type WagoDeviceOperationRow = RowOf<'deviceOperations'>;
export type WagoManagementRow = RowOf<'management'>;
export type WagoCredentialRotationRow = RowOf<'credentialRotations'>;
export type WagoNetworkChangeRow = RowOf<'networkChanges'>;
export type WagoMqttCredentialRetirementRow = RowOf<'mqttCredentialRetirements'>;

/** Context members the storage accessor needs; test doubles pass an in-memory `storage`. */
export type WagoStorageHost = Pick<PluginContext, 'storage'>;
