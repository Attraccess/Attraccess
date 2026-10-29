import { z } from 'zod';
import { STORAGE_SCHEMA_VERSION, WIRE_VERSION } from './constants';
import {
  clusterIdSchema,
  deadlineSchema,
  endpointIdSchema,
  matterId64Schema,
  outcomeSchema,
  timestampSchema,
  uuidSchema,
} from './primitives';

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
  fabric: z.strictObject({ state: z.enum(['uninitialized', 'initialized']) }),
});
export const versionResponseSchema = z.strictObject({
  build: z.strictObject({ version: z.string(), commit: z.string() }),
  sidecar: z.string(),
  matterJs: z.string(),
  storageSchemaVersion: z.literal(STORAGE_SCHEMA_VERSION),
  wireVersion: z.literal(WIRE_VERSION),
});

// --- fabric -----------------------------------------------------------------------------------

export const fabricStatusSchema = z.strictObject({
  state: z.enum(['uninitialized', 'initialized']),
  fabricId: matterId64Schema.nullable(),
});
export const fabricCreateRequestSchema = z.strictObject({
  label: z.string().min(1).max(32),
  deadlineMs: deadlineSchema.optional(),
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

export const endpointSchema = z.strictObject({
  endpointId: endpointIdSchema,
  deviceTypes: z.array(z.int().min(0)).max(32),
});
export const nodeSchema = z.strictObject({
  nodeId: matterId64Schema,
  reachable: z.boolean(),
  endpoints: z.array(endpointSchema).max(256),
  /** When this inventory view was last confirmed by the device. */
  observedAt: timestampSchema.nullable(),
});
export const nodeListSchema = z.strictObject({
  authoritative: z.boolean(),
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
