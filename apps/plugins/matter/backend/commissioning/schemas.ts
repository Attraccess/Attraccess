import { SHARE_WINDOW_MAX_SEC, SHARE_WINDOW_MIN_SEC } from '@attraccess/matter-contract';
import { z } from 'zod';

/** Empty text clears a field. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable();

/**
 * The same shapes the sidecar accepts: 11 or 21 digits, or a `MT:` QR payload. The browser strips spaces and hyphens
 * from a manual code; a value that does not match is refused without being echoed.
 */
export const startSchema = z.strictObject({
  setupCode: z.string().regex(/^[0-9]{11}$|^[0-9]{21}$|^MT:[A-Z0-9.-]{10,512}$/, 'must be a Matter setup code'),
  attestationOverride: z.strictObject({ confirmed: z.literal(true) }).optional(),
});
export type StartInput = z.infer<typeof startSchema>;

export const finishSchema = z.strictObject({
  displayName: optionalText(100).optional(),
  location: optionalText(100).optional(),
  endpoints: z
    .array(z.strictObject({ id: z.uuid(), displayName: z.string().trim().min(1).max(100) }))
    .max(256)
    .optional(),
});
export type FinishInput = z.infer<typeof finishSchema>;

export const removeSchema = z.strictObject({ mode: z.enum(['normal', 'force']), confirm: z.literal(true) });
export type RemoveInput = z.infer<typeof removeSchema>;

export const shareSchema = z.strictObject({
  timeoutSec: z.int().min(SHARE_WINDOW_MIN_SEC).max(SHARE_WINDOW_MAX_SEC).optional(),
});
export type ShareInput = z.infer<typeof shareSchema>;
