import { registerAs } from '@nestjs/config';
import * as path from 'path';
import { z } from 'zod';

export const DEFAULT_STORAGE_ROOT = path.join(process.cwd(), 'storage');

export const StorageEnvSchema = z.object({
  STORAGE_ROOT: z.string().default(DEFAULT_STORAGE_ROOT),
  MAX_FILE_SIZE_BYTES: z.coerce
    .number()
    .positive()
    .default(10 * 1024 * 1024), // 10MB
  CACHE_MAX_AGE_DAYS: z.coerce.number().positive().default(7),
});

export interface StorageConfigType {
  root: string;
  maxFileSize: number;
  allowedMimeTypes: readonly ['image/jpeg', 'image/png', 'image/webp'];
  cache: {
    maxAgeDays: number;
    directory: string;
  };
  cdn: {
    serveRoot: string;
    root: string;
  };
}

const storageConfigFactory = (): StorageConfigType => {
  const validatedEnv = StorageEnvSchema.parse(process.env);

  return {
    root: validatedEnv.STORAGE_ROOT,
    maxFileSize: validatedEnv.MAX_FILE_SIZE_BYTES,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] as const,
    cache: {
      maxAgeDays: validatedEnv.CACHE_MAX_AGE_DAYS,
      directory: path.join(validatedEnv.STORAGE_ROOT, 'cache'),
    },
    cdn: { serveRoot: '/cdn', root: path.join(validatedEnv.STORAGE_ROOT, 'cdn') },
  };
};

export default registerAs('storage', storageConfigFactory);

// For use in services that need to type the injected config:
// import { StorageConfigType } from 'path/to/storage.config';
// constructor(@Inject(storageConfig.KEY) private storageOptions: StorageConfigType) {}
// Or if using ConfigService:
// constructor(private configService: ConfigService) {
//   const storageOptions = this.configService.get<StorageConfigType>('storage');
// }
// The old AllowedMimeType can be derived from StorageConfigType['allowedMimeTypes'][number] if needed.
export type AllowedMimeType = StorageConfigType['allowedMimeTypes'][number];
