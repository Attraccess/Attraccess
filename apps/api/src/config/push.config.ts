// Web Push (VAPID) configuration. All keys optional: when unset, push notifications are disabled
// and the PushService degrades to a no-op (with a startup warning).
// Generate keys with: npx web-push generate-vapid-keys
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const PushEnvSchema = z.object({
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z
    .string()
    .regex(/^(mailto:|https?:\/\/)/, { message: 'VAPID_SUBJECT must be a mailto: or https: URL' })
    .optional(),
});

export type PushConfigType = z.infer<typeof PushEnvSchema> & {
  enabled: boolean;
};

const pushConfigFactory = (): PushConfigType => {
  try {
    const env = PushEnvSchema.parse(process.env);

    return {
      ...env,
      enabled: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT),
    };
  } catch (e) {
    if (e instanceof z.ZodError) {
      // eslint-disable-next-line no-console
      console.error('Failed to parse Push Environment Variables:', e.issues);
    } else {
      // eslint-disable-next-line no-console
      console.error('Failed to parse Push Environment Variables:', e);
    }
    throw new Error('Invalid push environment configuration.');
  }
};

export default registerAs('push', pushConfigFactory);
