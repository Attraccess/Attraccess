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

/** The setup code is a secret. It appears only in requests, never in responses, events or logs. */
export const commissioningRequestSchema = z.strictObject({
  setupCode: z.string().regex(/^[0-9]{11}$|^[0-9]{21}$|^MT:[A-Z0-9.-]{10,}$/),
  deadlineMs: deadlineSchema.optional(),
});
export const commissioningSessionSchema = z.strictObject({
  sessionId: uuidSchema,
  state: z.enum(['pending', 'running', 'succeeded', 'failed']),
  nodeId: matterId64Schema.nullable(),
  outcome: outcomeSchema,
});

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
