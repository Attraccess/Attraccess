import { z } from 'zod';
import { EVENT_SCHEMA_VERSION } from './constants';
import { capabilityReportSchema } from './capabilities';
import { commandResultSchema } from './families';
import {
  clusterIdSchema,
  correlationSchema,
  endpointIdSchema,
  matterId64Schema,
  timestampSchema,
  uuidSchema,
} from './primitives';

export const EVENT_TYPES = [
  'sidecar.lifecycle',
  'sidecar.capabilities',
  'fabric.changed',
  'commissioning.progress',
  'device.state',
  'command.outcome',
  'subscription.report',
  'thread.changed',
  'ota.progress',
] as const;
export const eventTypeSchema = z.enum(EVENT_TYPES);

/** `<streamInstanceId>.<sequence>`: identifies a position in exactly one sidecar run. */
export const cursorSchema = z.string().regex(/^[0-9a-f-]{36}\.[0-9]{1,15}$/);
export const sequenceSchema = z.int().min(1);

export const lifecyclePayloadSchema = z.strictObject({
  // 'stopped' is reserved: the stream closes with the process, so no client can receive it in this release.
  phase: z.enum(['started', 'draining', 'stopped']),
});
/** Payload of events whose feature is not implemented yet. Defines only the envelope slot. */
export const opaquePayloadSchema = z.record(z.string(), z.unknown());

/** One attribute value of one endpoint, as the sidecar observed it. */
export const deviceStatePayloadSchema = z.strictObject({
  nodeId: matterId64Schema,
  endpointId: endpointIdSchema,
  clusterId: clusterIdSchema,
  attributeId: clusterIdSchema,
  /** A JSON value; structured values (lists, structs) stay bounded. */
  value: z.union([
    z.string().max(1_024),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.unknown()).max(64),
    z.record(z.string(), z.unknown()),
  ]),
  /** When the device or the sidecar observed the value. */
  observedAt: timestampSchema,
  source: z.enum(['subscription_report', 'read', 'command_response']),
  fault: z.strictObject({ code: z.string().min(1).max(64), message: z.string().max(256) }).optional(),
  /** The subscription's maximum report interval, when the value came from one. Staleness derives from it. */
  maxIntervalSec: z.int().min(1).max(3_600).optional(),
});
export type DeviceStatePayload = z.infer<typeof deviceStatePayloadSchema>;

export const commandOutcomePayloadSchema = commandResultSchema.extend({
  nodeId: matterId64Schema,
  endpointId: endpointIdSchema,
  failureCode: z.string().min(1).max(64).optional(),
});
export type CommandOutcomePayload = z.infer<typeof commandOutcomePayloadSchema>;

/** Payload schemas by event type, for the types that are implemented. The others keep the opaque slot. */
const TYPED_PAYLOADS: Partial<Record<(typeof EVENT_TYPES)[number], z.ZodType>> = {
  'device.state': deviceStatePayloadSchema,
  'command.outcome': commandOutcomePayloadSchema,
};

export const eventEnvelopeSchema = z
  .strictObject({
    eventId: uuidSchema,
    schemaVersion: z.literal(EVENT_SCHEMA_VERSION),
    type: eventTypeSchema,
    timestamp: timestampSchema,
    correlation: correlationSchema,
    streamInstanceId: uuidSchema,
    sequence: sequenceSchema,
    payload: z.union([
      lifecyclePayloadSchema,
      capabilityReportSchema,
      deviceStatePayloadSchema,
      commandOutcomePayloadSchema,
      opaquePayloadSchema,
    ]),
  })
  .superRefine((event, context) => {
    const typed = TYPED_PAYLOADS[event.type];
    if (!typed) return;
    const result = typed.safeParse(event.payload);
    if (result.success) return;
    for (const issue of result.error.issues) {
      context.addIssue({ code: 'custom', message: issue.message, path: ['payload', ...issue.path] });
    }
  });
export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export function formatCursor(streamInstanceId: string, sequence: number): string {
  return `${streamInstanceId}.${sequence}`;
}

export function parseCursor(cursor: string): { streamInstanceId: string; sequence: number } | null {
  if (!cursorSchema.safeParse(cursor).success) return null;
  const separator = cursor.lastIndexOf('.');
  return { streamInstanceId: cursor.slice(0, separator), sequence: Number(cursor.slice(separator + 1)) };
}
