import { z } from 'zod';
import { STORAGE_SCHEMA_VERSION, WIRE_VERSION } from './constants';
import {
  clusterIdSchema,
  deadlineSchema,
  deviceTypeIdSchema,
  endpointIdSchema,
  matterId64Schema,
  outcomeSchema,
  timestampSchema,
  uuidSchema,
} from './primitives';

export const fabricStateSchema = z.enum(['uninitialized', 'initialized', 'recovery_required']);
/** Why the sidecar refuses to use its storage. A code only: it never carries paths or key material. */
export const recoveryReasonSchema = z.enum([
  'storage_unreadable',
  'storage_corrupt',
  'storage_incomplete',
  'schema_mismatch',
  'metadata_missing',
  'metadata_orphaned',
  /**
   * A restore stopped after the live storage was moved into the rollback copy and before the restored storage was in
   * place. The rollback copy holds the previous fabric; the sidecar leaves both alone.
   */
  'restore_interrupted',
]);
const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);
const generationSchema = z.int().min(0);

// --- health / version -------------------------------------------------------------------------

export const liveResponseSchema = z.strictObject({ status: z.literal('live') });
export const readyResponseSchema = z.strictObject({
  status: z.enum(['ready', 'starting', 'draining']),
  checks: z.strictObject({
    configuration: z.boolean(),
    matterPlatform: z.boolean(),
    transport: z.boolean(),
    shuttingDown: z.boolean(),
  }),
  /** Fabric state is reported separately; readiness never depends on it. */
  fabric: z.strictObject({ state: fabricStateSchema }),
});
export const versionResponseSchema = z.strictObject({
  build: z.strictObject({ version: z.string(), commit: z.string() }),
  sidecar: z.string(),
  matterJs: z.string(),
  storageSchemaVersion: z.literal(STORAGE_SCHEMA_VERSION),
  wireVersion: z.literal(WIRE_VERSION),
});

// --- fabric -----------------------------------------------------------------------------------

/** Public fabric facts only. Keys, the IPK and certificate private material never appear in any response. */
export const fabricStatusSchema = z.strictObject({
  state: fabricStateSchema,
  /** Set only while `state` is `recovery_required`. */
  reason: recoveryReasonSchema.nullable(),
  fabricId: matterId64Schema.nullable(),
  /** Bumped by every operation that changes the fabric identity (create, restore, later commission and remove). */
  fabricGeneration: generationSchema,
  /** SHA-256 of the root CA certificate, which is public. */
  rootCertFingerprint: sha256HexSchema.nullable(),
  storageInstanceId: uuidSchema.nullable(),
  storageSchemaVersion: z.literal(STORAGE_SCHEMA_VERSION),
});
export const fabricCreateRequestSchema = z.strictObject({
  label: z.string().min(1).max(32),
  deadlineMs: deadlineSchema.optional(),
});

// --- backup -----------------------------------------------------------------------------------

/** Non-secret description of a snapshot. The payload itself is opaque and holds the fabric secrets. */
export const backupHeaderSchema = z.strictObject({
  storageSchemaVersion: z.int().min(1),
  sidecarVersion: z.string().max(64),
  matterJsVersion: z.string().max(64),
  fabricId: matterId64Schema,
  rootCertFingerprint: sha256HexSchema,
  fabricGeneration: generationSchema,
  storageInstanceId: uuidSchema,
  /** SHA-256 of the decoded payload bytes. */
  payloadSha256: sha256HexSchema,
  payloadBytes: z.int().min(1),
  createdAt: timestampSchema,
});
export type BackupHeader = z.infer<typeof backupHeaderSchema>;
/** The payload travels as standard base64. It is a secret: only ever over an encrypted link, never logged. */
const payloadBase64Schema = z
  .string()
  .min(4)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/);
export const backupSnapshotRequestSchema = z.strictObject({ deadlineMs: deadlineSchema.optional() });
export const backupSnapshotSchema = z.strictObject({ header: backupHeaderSchema, payload: payloadBase64Schema });
export const backupStageRequestSchema = z.strictObject({ header: backupHeaderSchema, payload: payloadBase64Schema });
/** What a restore would put in place. Staging touches no live storage. */
export const backupStageSchema = z.strictObject({
  stageId: uuidSchema,
  fabricId: matterId64Schema,
  rootCertFingerprint: sha256HexSchema,
  fabricGeneration: generationSchema,
  storageInstanceId: uuidSchema,
  expiresAt: timestampSchema,
});
export const backupStageIdSchema = z.strictObject({ stageId: uuidSchema, deadlineMs: deadlineSchema.optional() });
export const backupRestoreResultSchema = z.strictObject({
  /** `committed`: the staged storage is live and verified; the previous storage is kept as a rollback copy. */
  state: z.enum(['committed', 'rolled_back', 'finalized', 'aborted']),
  fabric: fabricStatusSchema,
});

// --- commissioning ----------------------------------------------------------------------------

export const commissioningStepSchema = z.enum([
  'discovering',
  'pase',
  'reading_device',
  'attestation',
  'adding_fabric',
  /** Not used for devices already on an IP network; reserved for Thread. */
  'network_setup',
  'case',
  'interrogating',
  'completed',
]);
export const commissioningFailureCodeSchema = z.enum([
  'invalid_code',
  'device_not_found',
  /** The passcode was wrong, or the device refused the pairing. */
  'pase_failed',
  'attestation_failed',
  'already_commissioned',
  'fabric_full',
  'case_failed',
  'timeout',
  'cancelled',
  'interrupted',
  'internal',
]);
/** The name of an attestation finding (for example `PaaNotTrusted`). A type only: never certificate content. */
export const attestationFindingTypeSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/);
export const commissioningFailureSchema = z.strictObject({
  code: commissioningFailureCodeSchema,
  /** Present for `attestation_failed`. */
  attestationFindings: z.array(attestationFindingTypeSchema).max(32).optional(),
  /** Present for `already_commissioned`: the node the device already is in this fabric. */
  existingNodeId: matterId64Schema.optional(),
});
export type CommissioningFailure = z.infer<typeof commissioningFailureSchema>;

/** The setup code is a secret. It appears only in requests, never in responses, events or logs. */
export const commissioningRequestSchema = z.strictObject({
  setupCode: z.string().regex(/^[0-9]{11}$|^[0-9]{21}$|^MT:[A-Z0-9.-]{10,}$/),
  /**
   * A new session that proceeds although attestation fails. Refused with `attestation_override_disabled` unless the
   * sidecar runs with `MATTER_SIDECAR_ALLOW_ATTESTATION_OVERRIDE=true`.
   */
  attestationOverride: z.strictObject({ confirmed: z.literal(true) }).optional(),
  deadlineMs: deadlineSchema.optional(),
});
export const commissioningSessionSchema = z.strictObject({
  sessionId: uuidSchema,
  state: z.enum(['pending', 'running', 'succeeded', 'failed']),
  step: commissioningStepSchema.nullable(),
  nodeId: matterId64Schema.nullable(),
  outcome: outcomeSchema,
  /** Set when `state` is `failed`. */
  failure: commissioningFailureSchema.nullable(),
  /** The attestation result so far: finding types only. `overridden` means a failure was accepted by an override. */
  attestation: z
    .strictObject({
      status: z.enum(['verified', 'failed', 'overridden']),
      findings: z.array(attestationFindingTypeSchema).max(32),
    })
    .nullable(),
  /** Whether this sidecar offers the attestation override at all. */
  attestationOverrideAllowed: z.boolean(),
  startedAt: timestampSchema,
  updatedAt: timestampSchema,
  finishedAt: timestampSchema.nullable(),
});
export type CommissioningSession = z.infer<typeof commissioningSessionSchema>;

/** Payload of the `commissioning.progress` event. Carries no setup code and no certificate content. */
export const commissioningProgressPayloadSchema = z.strictObject({
  sessionId: uuidSchema,
  step: commissioningStepSchema.nullable(),
  state: z.enum(['pending', 'running', 'succeeded', 'failed']),
  nodeId: matterId64Schema.nullable(),
  failure: commissioningFailureSchema.nullable(),
});
export type CommissioningProgressPayload = z.infer<typeof commissioningProgressPayloadSchema>;

// --- removal and sharing ----------------------------------------------------------------------

/**
 * `force: false` sends RemoveFabric for the Attraccess fabric to the reachable device, then forgets the node.
 * `force: true` only forgets the node on the sidecar and never contacts the device.
 */
export const nodeRemoveRequestSchema = z.strictObject({ force: z.boolean(), deadlineMs: deadlineSchema.optional() });
export const nodeRemoveResultSchema = z.strictObject({
  nodeId: matterId64Schema,
  /** `removed_from_fabric`: the device confirmed. `forgotten`: forced, the device was not contacted. */
  result: z.enum(['removed_from_fabric', 'forgotten']),
  fabricGeneration: z.int().min(0),
});

export const SHARE_WINDOW_MIN_SEC = 180;
export const SHARE_WINDOW_MAX_SEC = 900;
export const shareOpenRequestSchema = z.strictObject({
  timeoutSec: z.int().min(SHARE_WINDOW_MIN_SEC).max(SHARE_WINDOW_MAX_SEC).default(SHARE_WINDOW_MIN_SEC),
  deadlineMs: deadlineSchema.optional(),
});
/** The codes are secrets that open the window for anyone who has them: returned once, never stored or logged. */
export const shareWindowSchema = z.strictObject({
  nodeId: matterId64Schema,
  manualCode: z.string().regex(/^[0-9]{11}$|^[0-9]{21}$/),
  qrCode: z.string().regex(/^MT:[A-Z0-9.-]{10,}$/),
  expiresAt: timestampSchema,
});
export const shareCloseRequestSchema = z.strictObject({ deadlineMs: deadlineSchema.optional() });
export const shareCloseResultSchema = z.strictObject({ nodeId: matterId64Schema, closed: z.boolean() });

// --- inventory --------------------------------------------------------------------------------

/**
 * Device types travel as `{deviceTypeId, revision}` pairs, so one list keeps each ID with its revision.
 * Matter device type revisions are uint16.
 */
export const deviceTypeSchema = z.strictObject({
  deviceTypeId: deviceTypeIdSchema,
  revision: z.int().min(0).max(0xffff),
});
export const clusterRoleSchema = z.enum(['server', 'client']);
export const endpointClusterSchema = z.strictObject({
  clusterId: clusterIdSchema,
  role: clusterRoleSchema,
  revision: z.int().min(0).max(0xffff).nullable(),
  featureMap: z.int().min(0).max(0xffff_ffff).nullable(),
  attributeIds: z.array(clusterIdSchema).max(512),
  acceptedCommandIds: z.array(clusterIdSchema).max(256),
});
/** Basic information a bridge reports about the device behind one of its endpoints. */
export const bridgedInfoSchema = z.strictObject({
  uniqueId: z.string().max(32).nullable(),
  nodeLabel: z.string().max(32).nullable(),
  vendorName: z.string().max(32).nullable(),
  productName: z.string().max(32).nullable(),
  serialNumber: z.string().max(32).nullable(),
  reachable: z.boolean().nullable(),
});
export const endpointSchema = z.strictObject({
  endpointId: endpointIdSchema,
  parentEndpointId: endpointIdSchema.nullable(),
  deviceTypes: z.array(deviceTypeSchema).max(32),
  clusters: z.array(endpointClusterSchema).max(128),
  /** Present only for endpoints a bridge exposes. */
  bridged: bridgedInfoSchema.nullable(),
});
export const attestationStatusSchema = z.enum(['verified', 'unverified', 'failed', 'unknown']);
/** Another administrator of the device: a fabric the device is joined to. */
export const administratorSchema = z.strictObject({
  fabricIndex: z.int().min(1).max(254),
  vendorId: z.int().min(0).max(0xffff).nullable(),
  fabricLabel: z.string().max(32).nullable(),
  /** True for the Attraccess fabric itself. */
  isOwn: z.boolean(),
});
export const nodeSchema = z.strictObject({
  nodeId: matterId64Schema,
  reachable: z.boolean(),
  vendorId: z.int().min(0).max(0xffff).nullable(),
  productId: z.int().min(0).max(0xffff).nullable(),
  vendorName: z.string().max(32).nullable(),
  productName: z.string().max(32).nullable(),
  serialNumber: z.string().max(32).nullable(),
  uniqueId: z.string().max(32).nullable(),
  hardwareVersion: z.int().min(0).max(0xffff).nullable(),
  softwareVersion: z.int().min(0).max(0xffff_ffff).nullable(),
  softwareVersionString: z.string().max(64).nullable(),
  attestation: z.strictObject({ status: attestationStatusSchema, checkedAt: timestampSchema.nullable() }),
  endpoints: z.array(endpointSchema).max(256),
  /** Every fabric the device is joined to, Attraccess's own included. */
  administrators: z.array(administratorSchema).max(254).default([]),
  /** When this inventory view was last confirmed by the device. */
  observedAt: timestampSchema.nullable(),
});
export const nodeListSchema = z.strictObject({
  /** False when the sidecar's view may be partial: consumers must not detach anything because of it. */
  authoritative: z.boolean(),
  /** The fabric the nodes belong to; null while the sidecar has no fabric. */
  fabricId: matterId64Schema.nullable(),
  nodes: z.array(nodeSchema).max(1_000),
});
export const nodeParamsSchema = z.strictObject({ nodeId: matterId64Schema });

// --- commands ---------------------------------------------------------------------------------

export const commandRequestSchema = z.strictObject({
  /** Idempotency key. An ambiguous command is never retried automatically with a new one. */
  requestId: uuidSchema,
  endpointId: endpointIdSchema,
  clusterId: clusterIdSchema,
  commandId: clusterIdSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
  deadlineMs: deadlineSchema.optional(),
});
/** Requested, accepted and reported outcomes stay distinct. */
export const commandResultSchema = z.strictObject({
  requestId: uuidSchema,
  outcome: outcomeSchema,
  acceptedAt: timestampSchema.nullable(),
  reportedAt: timestampSchema.nullable(),
});

// --- subscriptions ----------------------------------------------------------------------------

export const subscriptionRequestSchema = z
  .strictObject({
    nodeId: matterId64Schema,
    endpointId: endpointIdSchema.optional(),
    clusterId: clusterIdSchema.optional(),
    minIntervalSec: z.int().min(0).max(3_600),
    maxIntervalSec: z.int().min(1).max(3_600),
  })
  .refine((value) => value.minIntervalSec <= value.maxIntervalSec, {
    message: 'minIntervalSec must not exceed maxIntervalSec',
    path: ['minIntervalSec'],
  });
export const subscriptionSchema = z.strictObject({
  subscriptionId: uuidSchema,
  nodeId: matterId64Schema,
  state: z.enum(['active', 'closed']),
});
export const subscriptionParamsSchema = z.strictObject({ subscriptionId: uuidSchema });

// --- thread -----------------------------------------------------------------------------------

/** The Thread dataset is network key material. It appears only in requests. */
export const threadDatasetRequestSchema = z.strictObject({
  activeDataset: z.string().regex(/^[0-9a-fA-F]{2,508}$/),
});
export const threadNetworkSchema = z.strictObject({
  configured: z.boolean(),
  networkName: z.string().max(16).nullable(),
});

// --- ota --------------------------------------------------------------------------------------

export const otaRequestSchema = z.strictObject({
  nodeId: matterId64Schema,
  targetSoftwareVersion: z.int().min(0).max(0xffff_ffff),
  deadlineMs: deadlineSchema.optional(),
});
export const otaUpdateSchema = z.strictObject({
  updateId: uuidSchema,
  nodeId: matterId64Schema,
  state: z.enum(['queued', 'transferring', 'applied', 'failed']),
  outcome: outcomeSchema,
});
export const otaParamsSchema = z.strictObject({ updateId: uuidSchema });

export const sessionParamsSchema = z.strictObject({ sessionId: uuidSchema });
