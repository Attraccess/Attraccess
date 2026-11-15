import { z } from 'zod';
import { MAX_BACKUP_BODY_BYTES } from '@attraccess/matter-contract';

const label = z.string().trim().min(1).max(32);

export const createFabricSchema = z.strictObject({ label: label.optional() });
export const acknowledgeSchema = z.strictObject({ keyId: z.string().regex(/^[0-9a-f]{16}$/) });
export const rotateSchema = z.strictObject({ confirm: z.literal(true) });
export const acceptSidecarSchema = z.strictObject({ confirm: z.literal(true) });
export const startNewSchema = z.strictObject({ confirm: z.literal(true), label: label.optional() });

export const idParamSchema = z.uuid();
export const validateSchema = z.strictObject({
  source: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('stored'), backupId: z.uuid() }),
    z.strictObject({
      type: z.literal('upload'),
      // base64 of a file of at most the backup body limit
      contentBase64: z
        .string()
        .min(1)
        .max(Math.ceil((MAX_BACKUP_BODY_BYTES * 4) / 3) + 8),
    }),
  ]),
  recoveryKey: z.string().max(128).optional(),
});
export const confirmSchema = z.strictObject({
  validationId: z.uuid(),
  confirmFabricId: z.string().max(32).optional(),
});
