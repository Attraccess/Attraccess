import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const FlowEnvSchema = z.object({
  FLOW_LOG_TTL_DAYS: z.coerce.number().default(7),
});

export type FlowConfigType = z.infer<typeof FlowEnvSchema>;

const flowConfigFactory = (): FlowConfigType => {
  try {
    return FlowEnvSchema.parse(process.env);
  } catch (e) {
    console.error('Failed to parse Flow Environment Variables:', e.errors);
    throw new Error('Invalid flow environment configuration.');
  }
};

export default registerAs('flow', flowConfigFactory);
