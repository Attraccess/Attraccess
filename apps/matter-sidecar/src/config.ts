import { z } from 'zod';

export const Config = z.strictObject({
  host: z.enum(['127.0.0.1', '::1']).default('127.0.0.1'),
  port: z.coerce.number().int().min(0).max(65535).default(3080),
  payloadBytes: z.number().int().min(128).max(1048576).default(1048576),
  requestTimeoutMs: z.number().int().min(10).max(60000).default(10000),
  shutdownMs: z.number().int().min(10).max(10000).default(5000),
  replayEvents: z.number().int().min(1).max(10000).default(10000),
  replayAgeMs: z.number().int().min(1).max(300000).default(300000),
  clientQueueBytes: z.number().int().min(128).max(4194304).default(1048576),
  resumeTimeoutMs: z.number().int().min(10).max(10000).default(10000),
});
export type SidecarConfig = z.infer<typeof Config>;
