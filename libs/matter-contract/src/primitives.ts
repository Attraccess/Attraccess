import { z } from 'zod';
import { MAX_REQUEST_DEADLINE_MS } from './constants';

export const uuidSchema = z.uuid();
export const timestampSchema = z.iso.datetime();

const UINT64_MAX = (1n << 64n) - 1n;

/** 64-bit Matter identifiers travel as decimal strings; JSON numbers lose precision above 2^53. */
const DECIMAL_ID = /^(0|[1-9][0-9]{0,19})$/;
export const matterId64Schema = z
  .string()
  .regex(DECIMAL_ID)
  // Zod keeps running checks after a failed regex, so guard before calling BigInt.
  .refine((value) => DECIMAL_ID.test(value) && BigInt(value) <= UINT64_MAX, 'must fit into 64 bits');
export const endpointIdSchema = z.int().min(0).max(65_534);
export const clusterIdSchema = z.int().min(0).max(0xffff_ffff);
/** Matter device type IDs are uint32. */
export const deviceTypeIdSchema = z.int().min(0).max(0xffff_ffff);

export const initiatorSchema = z.strictObject({
  userId: z.string().max(128).nullable(),
  requestId: z.string().max(128).nullable(),
});

/** Correlation context. Events the sidecar raises itself carry empty initiator fields. */
export const correlationSchema = z.strictObject({
  correlationId: uuidSchema,
  causationId: uuidSchema.nullable(),
  initiator: initiatorSchema,
});
export type Correlation = z.infer<typeof correlationSchema>;

export const deadlineSchema = z.int().min(1).max(MAX_REQUEST_DEADLINE_MS);

/** A request/response pair never distinguishes "accepted" from "done" implicitly. */
export const outcomeSchema = z.enum(['requested', 'accepted', 'reported', 'uncertain', 'failed']);
export type Outcome = z.infer<typeof outcomeSchema>;
