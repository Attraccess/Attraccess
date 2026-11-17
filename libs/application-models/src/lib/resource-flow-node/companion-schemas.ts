import { z } from 'zod';

const CompanionDeviceIdSchema = z.number().int().positive().meta({
  selectFromEntity: 'companionDevice',
  entityProperty: 'id',
});

export const CompanionLockNodeDataSchema = z.object({
  deviceId: CompanionDeviceIdSchema,
});

export const CompanionIdleActiveNodeDataSchema = z.object({
  deviceId: CompanionDeviceIdSchema,
});

export const CompanionForegroundAppNodeDataSchema = z.object({
  deviceId: CompanionDeviceIdSchema,
});

export const CompanionUsbDeviceNodeDataSchema = z.object({
  deviceId: CompanionDeviceIdSchema,
  vendorId: z.number().int().optional().meta({
    helpText: 'Optional USB vendor ID filter (decimal). Leave empty to match any vendor.',
  }),
  productId: z.number().int().optional().meta({
    helpText: 'Optional USB product ID filter (decimal). Leave empty to match any product.',
  }),
});
