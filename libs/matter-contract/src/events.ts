import { z } from 'zod';
import { Id, Timestamp, Sequence, Correlation, Cursor, Capabilities, ErrorEnvelope } from './primitives.js';
import {
  FabricStatus,
  CommissioningProgress,
  OperationResponse,
  Device,
  AttributeReport,
  DeviceEventReport,
  SubscriptionResponse,
  ThreadStatus,
  OtaProgress,
} from './features.js';

const base = {
  eventId: Id,
  schemaVersion: z.literal(1),
  timestamp: Timestamp,
  correlation: Correlation,
  streamInstanceId: Id,
  sequence: Sequence.min(1),
};
export const EventPayload = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('lifecycle'), payload: z.strictObject({ state: z.enum(['ready', 'draining']) }) }),
  z.strictObject({ type: z.literal('capabilities'), payload: Capabilities }),
  z.strictObject({ type: z.literal('fabric.status'), payload: FabricStatus }),
  z.strictObject({ type: z.literal('commissioning.progress'), payload: CommissioningProgress }),
  z.strictObject({ type: z.literal('commissioning.result'), payload: OperationResponse }),
  z.strictObject({ type: z.literal('inventory.device'), payload: Device }),
  z.strictObject({ type: z.literal('command.outcome'), payload: OperationResponse }),
  z.strictObject({ type: z.literal('subscription.attribute'), payload: AttributeReport }),
  z.strictObject({ type: z.literal('subscription.event'), payload: DeviceEventReport }),
  z.strictObject({ type: z.literal('subscription.terminated'), payload: SubscriptionResponse }),
  z.strictObject({ type: z.literal('thread.status'), payload: ThreadStatus }),
  z.strictObject({ type: z.literal('ota.progress'), payload: OtaProgress }),
  z.strictObject({ type: z.literal('ota.outcome'), payload: OperationResponse }),
]);
export const EventEnvelope = z.discriminatedUnion('type', [
  EventPayload.options[0].extend(base),
  ...EventPayload.options.slice(1).map((schema) => schema.extend(base)),
]);
export const ClientMessage = z.strictObject({
  schemaVersion: z.literal(1),
  type: z.literal('resume'),
  requestId: Id,
  cursor: Cursor.nullable(),
});
export const StreamReady = z.strictObject({
  schemaVersion: z.literal(1),
  type: z.literal('stream.ready'),
  requestId: Id,
  watermark: Cursor,
  delivery: z.literal('at_least_once'),
});
export const ServerMessage = z.union([EventEnvelope, StreamReady, ErrorEnvelope]);
export type MatterEvent = z.infer<typeof EventEnvelope>;
export type NewEvent = z.infer<typeof EventPayload>;
