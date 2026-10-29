import { z } from 'zod';
import { EVENT_SCHEMA_VERSION } from './constants';
import { capabilityReportSchema } from './capabilities';
import { correlationSchema, timestampSchema, uuidSchema } from './primitives';

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
  phase: z.enum(['started', 'draining', 'stopped']),
});
/** Payload of events whose feature is not implemented yet. Defines only the envelope slot. */
export const opaquePayloadSchema = z.record(z.string(), z.unknown());

export const eventEnvelopeSchema = z.strictObject({
  eventId: uuidSchema,
  schemaVersion: z.literal(EVENT_SCHEMA_VERSION),
  type: eventTypeSchema,
  timestamp: timestampSchema,
  correlation: correlationSchema,
  streamInstanceId: uuidSchema,
  sequence: sequenceSchema,
  payload: z.union([lifecyclePayloadSchema, capabilityReportSchema, opaquePayloadSchema]),
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
