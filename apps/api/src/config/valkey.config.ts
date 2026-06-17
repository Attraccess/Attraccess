import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const ValkeyEnvSchema = z.object({
  VALKEY_URL: z.string().url().optional(),
});

export type ValkeyConfigType = z.infer<typeof ValkeyEnvSchema>;

const valkeyConfigFactory = (): ValkeyConfigType => {
  try {
    return ValkeyEnvSchema.parse(process.env);
  } catch (e) {
    if (e instanceof z.ZodError) {
      // eslint-disable-next-line no-console
      console.error('Failed to parse Valkey Environment Variables:', e.issues);
    } else {
      // eslint-disable-next-line no-console
      console.error('Failed to parse Valkey Environment Variables:', e);
    }
    throw new Error('Invalid Valkey environment configuration.');
  }
};

export default registerAs('valkey', valkeyConfigFactory);
