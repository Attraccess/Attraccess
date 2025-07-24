import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const SessionEnvSchema = z.object({
  AUTH_SESSION_SECRET: z.string().min(1, { message: 'AUTH_SESSION_SECRET is required' }),
  SESSION_COOKIE_MAX_AGE: z.coerce.number().default(7 * 24 * 60 * 60 * 1000), // 7 days in milliseconds
});

export type SessionConfigType = z.infer<typeof SessionEnvSchema> & {};

const sessionConfigFactory = (): SessionConfigType => {
  try {
    const env = SessionEnvSchema.parse(process.env);

    return {
      ...env,
    };
  } catch (e) {
    if (e instanceof z.ZodError) {
      console.error('Failed to parse Session Environment Variables:', e.errors);
    } else {
      console.error('Failed to parse Session Environment Variables:', e);
    }
    throw new Error('Invalid session environment configuration.');
  }
};

export default registerAs('session', sessionConfigFactory);
