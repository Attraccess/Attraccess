import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import * as tar from 'tar';
import { PackageVersion } from './npm-registry-definitions';

export const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
export const MAX_EXTRACTED_BYTES = 200 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRIES = 10_000;
export function validateEntries(
  root: string,
  manifest: {
    main: {
      backend?: { directory: string; entryPoint: string };
      frontend?: { directory: string; entryPoint: string; styles?: string };
      migrations?: { directory: string; entryPoint: string };
    };
  },
): void {
  for (const entry of [manifest.main.backend, manifest.main.frontend, manifest.main.migrations]) {
    if (entry && !existsSync(join(root, entry.directory, entry.entryPoint)))
      throw new BadRequestException('Package declares an entry point that is not present');
  }
  if (
    manifest.main.frontend?.styles &&
    !existsSync(join(root, manifest.main.frontend.directory, manifest.main.frontend.styles))
  )
    throw new BadRequestException('Package declares styles that are not present');
}
export function verifyIntegrity(buffer: Buffer, dist: PackageVersion['dist']): void {
  if (dist.integrity) {
    const match = /^(sha(?:256|384|512))-(.+)$/.exec(dist.integrity);
    if (!match || createHash(match[1]).update(buffer).digest('base64') !== match[2])
      throw new BadRequestException('Tarball integrity check failed');
    return;
  }
  if (createHash('sha1').update(buffer).digest('hex') !== dist.shasum)
    throw new BadRequestException('Tarball integrity check failed');
}
export async function extractTarball(tarball: Buffer, destination: string): Promise<void> {
  let extractedBytes = 0;
  let entries = 0;
  await pipeline(
    Readable.from(tarball),
    tar.x({
      cwd: destination,
      gzip: true,
      strict: true,
      preservePaths: false,
      filter: (path, entry) => {
        if (
          !path.startsWith('package/') ||
          !safeArchivePath(path) ||
          !('type' in entry) ||
          !['File', 'Directory'].includes(entry.type)
        )
          throw new BadRequestException('Tarball contains an unsafe entry');
        entries += 1;
        extractedBytes += entry.size;
        if (entries > MAX_ARCHIVE_ENTRIES || extractedBytes > MAX_EXTRACTED_BYTES)
          throw new BadRequestException('Tarball exceeds extraction limits');
        return true;
      },
    }),
  );
}
export function safeArchivePath(value: string): boolean {
  return !value.startsWith('/') && !value.split('/').includes('..');
}
