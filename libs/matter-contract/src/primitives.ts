import { z } from 'zod';

export const WIRE_VERSION = 1;
export const STORAGE_SCHEMA_VERSION = 1;
export const Id = z.uuid();
// Fixed-width hexadecimal strings preserve all 64 bits through JSON and schema export.
export const UInt64 = z.string().regex(/^[0-9a-f]{16}$/);
export const Timestamp = z.iso.datetime({ precision: 3 });
export const Sequence = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
// Preserve build metadata in diagnostics; operational compatibility still uses exact release strings.
export const Release = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?![\s\S])/,
  )
  .max(100);
export const ReleaseTuple = z.strictObject({ attraccess: Release, plugin: Release, sidecar: Release });
export const Correlation = z.strictObject({ requestId: Id.nullable(), operationId: Id.nullable() });
export const Cursor = z.strictObject({ streamInstanceId: Id, sequence: Sequence });
export const NodeIdentity = z.strictObject({ fabricId: UInt64, nodeId: UInt64 });
export const Address = NodeIdentity.extend({
  endpointId: z.number().int().min(0).max(65535),
  clusterId: z.number().int().min(0).max(0xffffffff),
});
export const AttributeAddress = Address.extend({ attributeId: z.number().int().min(0).max(0xffffffff) });
export const CommandAddress = Address.extend({ commandId: z.number().int().min(0).max(0xffffffff) });
export const Operation = z.strictObject({ operationId: Id, cancellationId: Id, deadline: Timestamp });
export const Empty = z.strictObject({});
// Only these public values can appear in reports; binary credentials/datasets are never report values.
export const PublicValue = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('boolean'), value: z.boolean() }),
  z.strictObject({
    kind: z.literal('number'),
    value: z.number().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  }),
  z.strictObject({ kind: z.literal('text'), value: z.string().max(256) }),
  z.strictObject({ kind: z.literal('uint64'), value: UInt64 }),
]);
export const CapabilityName = z.enum([
  'fabric',
  'commissioning',
  'inventory',
  'commands',
  'subscriptions',
  'thread',
  'ota',
]);
export const Capability = z.strictObject({
  name: CapabilityName,
  contractSupported: z.literal(true),
  available: z.boolean(),
  reason: z.string().min(1).max(256).nullable(),
});
export const Capabilities = z.array(Capability).max(7);
export const ErrorCode = z.enum([
  'VALIDATION_ERROR',
  'UNSUPPORTED_WIRE_VERSION',
  'INCOMPATIBLE_RELEASE',
  'UNAVAILABLE',
  'UNSUPPORTED_CAPABILITY',
  'TIMEOUT',
  'RECONCILIATION_REQUIRED',
  'FORBIDDEN_ORIGIN',
  'NOT_FOUND',
  'PAYLOAD_TOO_LARGE',
  'INTERNAL_ERROR',
]);
export const Reconciliation = z.strictObject({
  reason: z.enum(['malformed', 'expired', 'evicted', 'future', 'different_instance', 'slow_client']),
  snapshotAvailable: z.literal(false),
  action: z.literal(
    'Keep consumer state unreconciled: authoritative snapshots are unavailable in this foundation. Do not silently advance the cursor or retry physical commands.',
  ),
});
export const ErrorEnvelope = z.strictObject({
  schemaVersion: z.literal(WIRE_VERSION),
  error: z.strictObject({
    code: ErrorCode,
    message: z.string().min(1).max(1024),
    requestId: Id,
    operationId: Id.nullable(),
    retryable: z.boolean(),
    details: z.strictObject({
      capability: CapabilityName.optional(),
      supportedWireVersions: z.array(z.literal(1)).optional(),
      received: z
        .strictObject({
          attraccess: z.string().max(100).nullable(),
          plugin: z.string().max(100).nullable(),
          sidecar: z.string().max(100).nullable(),
        })
        .optional(),
      supported: z.array(ReleaseTuple).optional(),
      reconciliation: Reconciliation.optional(),
    }),
  }),
});
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNSUPPORTED_WIRE_VERSION: 426,
  INCOMPATIBLE_RELEASE: 409,
  UNAVAILABLE: 503,
  UNSUPPORTED_CAPABILITY: 501,
  TIMEOUT: 504,
  RECONCILIATION_REQUIRED: 409,
  FORBIDDEN_ORIGIN: 403,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL_ERROR: 500,
} as const;
export type MatterError = z.infer<typeof ErrorEnvelope>;
export type ResumeCursor = z.infer<typeof Cursor>;
