import { registerAs } from '@nestjs/config';
import { loadEnv } from '@attraccess/env';

export type ValkeyConfigType = {
  VALKEY_URL?: string;
};

export default registerAs('valkey', () =>
  loadEnv((z) => ({
    VALKEY_URL: z.string().url().optional(),
  }))
);
