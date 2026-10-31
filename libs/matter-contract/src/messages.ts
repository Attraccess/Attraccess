import { z } from 'zod';
import { WIRE_VERSION } from './constants';
import { errorEnvelopeSchema } from './errors';
import { cursorSchema, eventEnvelopeSchema } from './events';
import { uuidSchema } from './primitives';

export const resumeMessageSchema = z.strictObject({
  type: z.literal('resume'),
  wireVersion: z.literal(WIRE_VERSION),
  /**
   * Omit to receive only events published after the resume. The format is checked by the sidecar, not here, so a
   * malformed cursor is answered with `reconciliation-required` instead of a validation error.
   */
  cursor: z.string().min(1).max(200).optional(),
});
export const pingMessageSchema = z.strictObject({
  type: z.literal('ping'),
  wireVersion: z.literal(WIRE_VERSION),
});
export const clientMessageSchema = z.discriminatedUnion('type', [resumeMessageSchema, pingMessageSchema]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const helloMessageSchema = z.strictObject({
  type: z.literal('hello'),
  wireVersion: z.literal(WIRE_VERSION),
  streamInstanceId: uuidSchema,
  /** Cursor of the newest published event, or null when none exists yet. */
  headCursor: cursorSchema.nullable(),
});
export const eventMessageSchema = z.strictObject({
  type: z.literal('event'),
  cursor: cursorSchema,
  event: eventEnvelopeSchema,
});
export const pongMessageSchema = z.strictObject({ type: z.literal('pong') });
/** Replay is impossible and no snapshot exists yet. The client must reconcile by other means. */
export const reconciliationRequiredMessageSchema = z.strictObject({
  type: z.literal('reconciliation-required'),
  reason: z.enum(['malformed', 'expired', 'evicted', 'future', 'foreign-stream']),
  snapshot: z.literal('unavailable'),
  streamInstanceId: uuidSchema,
});
export const errorMessageSchema = z.strictObject({ type: z.literal('error'), ...errorEnvelopeSchema.shape });
export const serverMessageSchema = z.discriminatedUnion('type', [
  helloMessageSchema,
  eventMessageSchema,
  pongMessageSchema,
  reconciliationRequiredMessageSchema,
  errorMessageSchema,
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

/** WebSocket close codes used by the sidecar. */
export const CLOSE_CODES = {
  normal: 1000,
  goingAway: 1001,
  policyViolation: 1008,
  messageTooBig: 1009,
  tryAgainLater: 1013,
} as const;
