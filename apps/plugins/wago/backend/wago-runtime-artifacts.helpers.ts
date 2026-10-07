import { lstat } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { temporaryPattern } from './wago-runtime-artifacts.state';
import { hostId } from './wago-runtime-artifacts.state';
import { validateRuntimeManifest } from './wago-runtime-artifacts-verification';
import type { RuntimeArtifactMetadata } from './wago-runtime-artifacts.contracts';
import { digestPattern } from './wago-runtime-artifacts.state';
import { randomUUID } from 'node:crypto';
import { processId } from './wago-runtime-artifacts.state';
import { BadRequestException } from '@nestjs/common';
import { Readable } from 'node:stream';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/** The root is trusted host configuration; every component below it must be a real directory. */
export async function artifactDirectory(parent: string, name: string): Promise<string> {
  const path = join(parent, name);
  await mkdir(path, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error;
  });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid artifact storage directory');
  return path;
}

export async function openArtifactFile(path: string) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  if (!(await file.stat()).isFile()) {
    await file.close();
    throw new Error('Invalid artifact file');
  }
  return file;
}

export function ownerIsDead(name: string, kind: string): boolean {
  const match = temporaryPattern.exec(name);
  if (!match || match[1] !== kind || match[2] !== hostId) return false;
  const pid = Number(match[3]);
  if (!Number.isSafeInteger(pid) || pid > 2147483647 || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

export async function smallFile(path: string, limit: number) {
  const file = await openArtifactFile(path);
  try {
    if ((await file.stat()).size > limit) throw new Error('Artifact metadata is too large');
    return await file.readFile('utf8');
  } finally {
    await file.close();
  }
}

export function storedMetadata(value: unknown, maxBytes: number): RuntimeArtifactMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid catalog metadata');
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).sort().join(',') !== 'bytes,digest,image,manifest' ||
    typeof data.digest !== 'string' ||
    !digestPattern.test(data.digest) ||
    !Number.isSafeInteger(data.bytes) ||
    typeof data.image !== 'string'
  )
    throw new Error('Invalid catalog metadata');
  if (typeof data.bytes !== 'number' || !Number.isSafeInteger(data.bytes) || data.bytes < 1 || data.bytes > maxBytes)
    throw new Error('Invalid catalog metadata');
  const bytes = data.bytes;
  const manifest = validateRuntimeManifest(data.manifest);
  if (data.image !== manifest.image) throw new Error('Invalid catalog metadata');
  return Object.freeze({ digest: data.digest, bytes, image: data.image, manifest });
}

export // The name is an atomic ownership marker: no mkdir/write-marker crash window and no
// lease expiry that could collect a slow live owner. Unknown/remote owners and reused
// live PIDs are retained conservatively. UUIDs prevent names being reused by a new process.
function temporaryName(kind: 'upload' | 'delivery' | 'current') {
  return `${kind}-v1-${hostId}-${process.pid}-${processId}-${randomUUID()}`;
}

export async function writeArtifactStream(path: string, source: Readable, limit: number) {
  let bytes = 0;
  const file = await open(
    path,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await pipeline(
      source,
      new Writable({
        write(chunk, _encoding, callback) {
          bytes += chunk.length;
          if (bytes > limit) {
            callback(new BadRequestException('Runtime artifact upload exceeds the size limit'));
            return;
          }
          const write = async () => {
            let offset = 0;
            while (offset < chunk.length)
              offset += (await file.write(chunk, offset, chunk.length - offset)).bytesWritten;
          };
          write().then(() => callback(), callback);
        },
      }),
    );
    await file.sync();
  } finally {
    await file.close();
  }
  return bytes;
}
