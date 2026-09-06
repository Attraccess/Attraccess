import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { constants, Dir } from 'node:fs';
import { lstat, mkdir, open, opendir, readdir, realpath, rename, rm, chmod } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  inspectRuntimeTar,
  RuntimeArtifactManifest,
  validateRuntimeManifest,
  verifyRuntimeSignature,
  WAGO_RUNTIME_MAX_BYTES,
  WAGO_RUNTIME_RELEASE_KEY,
} from './wago-runtime-artifacts-verification';

export { WAGO_RUNTIME_MAX_BYTES } from './wago-runtime-artifacts-verification';
export type { RuntimeArtifactManifest } from './wago-runtime-artifacts-verification';
export interface RuntimeArtifactMetadata {
  readonly digest: string;
  readonly bytes: number;
  readonly image: string;
  readonly manifest: RuntimeArtifactManifest;
}
export interface VerifiedRuntimeArtifact extends RuntimeArtifactMetadata {
  readonly path: string;
  readonly directory: string;
  cleanup(): Promise<void>;
}
export interface RuntimeArtifactUpload {
  bundle: Readable;
  checksum: Readable;
  signature: Readable;
}
const digestPattern = /^[a-f0-9]{64}$/;
const hostId = createHash('sha256').update(hostname()).digest('hex');
const processId = randomUUID();
const uuidPattern = '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const temporaryPattern = new RegExp(
  `^(upload|delivery|current)-v1-([a-f0-9]{64})-([1-9][0-9]*)-(${uuidPattern})-(${uuidPattern})$`,
);

// The name is an atomic ownership marker: no mkdir/write-marker crash window and no
// lease expiry that could collect a slow live owner. Unknown/remote owners and reused
// live PIDs are retained conservatively. UUIDs prevent names being reused by a new process.
function temporaryName(kind: 'upload' | 'delivery' | 'current') {
  return `${kind}-v1-${hostId}-${process.pid}-${processId}-${randomUUID()}`;
}
function ownerIsDead(name: string, kind: string): boolean {
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
async function smallFile(path: string, limit: number) {
  const file = await openArtifactFile(path);
  try {
    if ((await file.stat()).size > limit) throw new Error('Artifact metadata is too large');
    return await file.readFile('utf8');
  } finally {
    await file.close();
  }
}
function storedMetadata(value: unknown, maxBytes: number): RuntimeArtifactMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid catalog metadata');
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).sort().join(',') !== 'bytes,digest,image,manifest' ||
    typeof data.digest !== 'string' ||
    !digestPattern.test(data.digest) ||
    !Number.isSafeInteger(data.bytes) ||
    data.bytes < 1 ||
    data.bytes > maxBytes ||
    typeof data.image !== 'string'
  )
    throw new Error('Invalid catalog metadata');
  const manifest = validateRuntimeManifest(data.manifest);
  if (data.image !== manifest.image) throw new Error('Invalid catalog metadata');
  return Object.freeze({ digest: data.digest, bytes: data.bytes, image: data.image, manifest });
}

/** Internal catalog. Trust-key injection exists for isolated signing fixtures; HTTP never supplies it. */
export class WagoRuntimeArtifactCatalog {
  private activeImports = 0;
  private readonly scans = new Map<string, Dir>();
  private reconciliation?: Promise<void>;
  constructor(
    private readonly storageRoot: string,
    private readonly trustedKey = WAGO_RUNTIME_RELEASE_KEY,
    private readonly maxBytes = WAGO_RUNTIME_MAX_BYTES,
  ) {}

  async root(): Promise<string> {
    await mkdir(this.storageRoot, { recursive: true, mode: 0o700 });
    // Canonicalize only the host-owned root (e.g. macOS /tmp); never canonicalize catalog children.
    const root = await artifactDirectory(await realpath(this.storageRoot), 'wago-runtime-artifacts');
    await artifactDirectory(root, 'objects');
    await artifactDirectory(root, 'staging');
    await artifactDirectory(root, 'snapshots');
    // One bounded pass on first access and each subsequent access. Retaining directory
    // cursors avoids starving later entries behind active or unknown entries.
    if (!this.reconciliation) {
      this.reconciliation = this.reconcile(root).finally(() => {
        this.reconciliation = undefined;
      });
    }
    await this.reconciliation;
    return root;
  }
  async onModuleInit() {
    await this.root();
  }
  async onModuleDestroy() {
    await this.reconciliation;
    await Promise.all([...this.scans.values()].map((directory) => directory.close()));
    this.scans.clear();
  }
  private async reconcile(root: string) {
    for (const [parent, kind] of [
      [join(root, 'staging'), 'upload'],
      [join(root, 'snapshots'), 'delivery'],
      [root, 'current'],
    ]) {
      let scan = this.scans.get(parent);
      if (!scan) {
        scan = await opendir(parent);
        this.scans.set(parent, scan);
      }
      for (let count = 0; count < 32; count++) {
        const entry = await scan.read();
        if (!entry) {
          await scan.close();
          this.scans.delete(parent);
          break;
        }
        if (!ownerIsDead(entry.name, kind)) continue;
        const path = join(parent, entry.name);
        try {
          const info = await lstat(path);
          if (info.isSymbolicLink() || (kind === 'current' ? !info.isFile() : !info.isDirectory())) continue;
          // A proven-dead owner cannot rename this temporary directory into objects or
          // activate its pointer concurrently. Never scan objects or the current pointer.
          await rm(path, { recursive: kind !== 'current', force: true });
        } catch (error) {
          // A second host process may already have reconciled the same dead owner.
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    }
  }
  private async createTemporaryDirectory(parent: string, kind: 'upload' | 'delivery') {
    const directory = join(parent, temporaryName(kind));
    await mkdir(directory, { mode: 0o700 });
    return directory;
  }
  async createUploadDirectory() {
    return this.createTemporaryDirectory(join(await this.root(), 'staging'), 'upload');
  }
  private async verify(directory: string): Promise<RuntimeArtifactMetadata> {
    const file = await openArtifactFile(join(directory, 'runtime.tar'));
    try {
      const bytes = (await file.stat()).size;
      if (!bytes || bytes > this.maxBytes) throw new Error('Runtime artifact exceeds the size limit');
      const hash = createHash('sha256');
      for await (const chunk of file.createReadStream({ start: 0, autoClose: false })) hash.update(chunk);
      const digest = hash.digest('hex');
      const checksum = await smallFile(join(directory, 'runtime.tar.sha256'), 4096);
      if (!new RegExp(`^${digest}(?:[ \\t]+\\*?[A-Za-z0-9_.-]+\\.tar)?\\r?\\n?$`).test(checksum))
        throw new Error('Runtime artifact checksum does not match');
      await verifyRuntimeSignature(file, await smallFile(join(directory, 'runtime.tar.sig'), 16384), this.trustedKey);
      const manifest = await inspectRuntimeTar(file, bytes);
      return Object.freeze({ digest, bytes, image: manifest.image, manifest });
    } finally {
      await file.close();
    }
  }
  private async writeMetadata(directory: string, metadata: RuntimeArtifactMetadata) {
    await writeArtifactStream(join(directory, 'metadata.json'), Readable.from([JSON.stringify(metadata)]), 4096);
  }
  private async metadata(root: string, digest: string) {
    const directory = join(root, 'objects', digest);
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid catalog object');
    const metadata = storedMetadata(JSON.parse(await smallFile(join(directory, 'metadata.json'), 4096)), this.maxBytes);
    if (metadata.digest !== digest) throw new Error('Invalid catalog digest');
    return metadata;
  }
  private async verifiedMetadata(root: string, digest: string) {
    const directory = join(root, 'objects', digest);
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid catalog object');
    const metadata = await this.verify(directory);
    if (metadata.digest !== digest) throw new Error('Invalid catalog digest');
    return metadata;
  }
  async import(upload: RuntimeArtifactUpload): Promise<RuntimeArtifactMetadata> {
    if (this.activeImports >= 2) {
      for (const source of Object.values(upload)) source.destroy();
      throw new ConflictException('Another runtime import is in progress; retry shortly');
    }
    this.activeImports++;
    let directory: string | undefined;
    try {
      directory = await this.createUploadDirectory();
      // Wait for all writers before cleanup, including when one stream fails.
      const results = await Promise.allSettled([
        writeArtifactStream(join(directory, 'runtime.tar'), upload.bundle, this.maxBytes),
        writeArtifactStream(join(directory, 'runtime.tar.sha256'), upload.checksum, 4096),
        writeArtifactStream(join(directory, 'runtime.tar.sig'), upload.signature, 16384),
      ]);
      if (results.some((result) => result.status === 'rejected'))
        throw new Error('Invalid or oversized artifact upload');
      const metadata = await this.verify(directory);
      await this.writeMetadata(directory, metadata);
      const root = await this.root();
      for (const name of ['runtime.tar', 'runtime.tar.sha256', 'runtime.tar.sig', 'metadata.json'])
        await chmod(join(directory, name), 0o400);
      const stageHandle = await open(directory, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        await stageHandle.sync();
      } finally {
        await stageHandle.close();
      }
      const destination = join(root, 'objects', metadata.digest);
      try {
        await rename(directory, destination);
      } catch (error) {
        if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
        const existing = await lstat(destination);
        if (
          !existing.isDirectory() ||
          existing.isSymbolicLink() ||
          (await this.verify(destination)).digest !== metadata.digest
        )
          throw new Error('Invalid catalog object');
      }
      const objectsHandle = await open(join(root, 'objects'), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        await objectsHandle.sync();
      } finally {
        await objectsHandle.close();
      }
      // Complete immutable objects are published before the atomic current-pointer replacement.
      const pointer = join(root, temporaryName('current'));
      try {
        await writeArtifactStream(pointer, Readable.from([metadata.digest]), 64);
        await rename(pointer, join(root, 'current'));
        const handle = await open(root, constants.O_RDONLY);
        try {
          await handle.sync();
        } finally {
          await handle.close();
        }
      } finally {
        await rm(pointer, { force: true });
      }
      return metadata;
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new BadRequestException(
        'Runtime import failed. Check the signed release files, size, and manifest compatibility.',
      );
    } finally {
      for (const source of Object.values(upload)) source.destroy();
      try {
        if (directory) await rm(directory, { recursive: true, force: true });
      } finally {
        this.activeImports--;
      }
    }
  }
  async current(): Promise<RuntimeArtifactMetadata | null> {
    const root = await this.root();
    let digest: string;
    try {
      digest = await smallFile(join(root, 'current'), 64);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    if (!digestPattern.test(digest)) throw new Error('Invalid current runtime artifact');
    return this.metadata(root, digest);
  }
  async list(): Promise<RuntimeArtifactMetadata[]> {
    const root = await this.root();
    const result: RuntimeArtifactMetadata[] = [];
    for (const digest of (await readdir(join(root, 'objects'))).sort()) {
      if (digestPattern.test(digest)) result.push(await this.metadata(root, digest));
    }
    return result;
  }
  async has(): Promise<boolean> {
    try {
      const current = await this.current();
      if (!current) return false;
      await this.verifiedMetadata(await this.root(), current.digest);
      return true;
    } catch {
      return false;
    }
  }
  /** Copies to an owned snapshot and re-verifies it; later imports never change this delivery. */
  async acquire(digest?: string): Promise<VerifiedRuntimeArtifact> {
    const selected = digest ?? (await this.current())?.digest;
    if (!selected || !digestPattern.test(selected))
      throw new ConflictException('Import a verified runtime release first');
    const root = await this.root();
    await this.verifiedMetadata(root, selected);
    const directory = await this.createTemporaryDirectory(join(root, 'snapshots'), 'delivery');
    const cleanup = () => rm(directory, { recursive: true, force: true });
    try {
      for (const [name, limit] of [
        ['runtime.tar', this.maxBytes],
        ['runtime.tar.sha256', 4096],
        ['runtime.tar.sig', 16384],
      ] as const) {
        const file = await openArtifactFile(join(root, 'objects', selected, name));
        try {
          await writeArtifactStream(join(directory, name), file.createReadStream({ autoClose: false }), limit);
        } finally {
          await file.close();
        }
      }
      const metadata = await this.verify(directory);
      if (metadata.digest !== selected) throw new Error('Artifact changed during snapshot acquisition');
      return Object.freeze({ ...metadata, path: join(directory, 'runtime.tar'), directory, cleanup });
    } catch (error) {
      await cleanup();
      throw error;
    }
  }
}

/** Register this provider alongside WagoArtifactsController. No operator path/key/env input. */
@Injectable()
export class WagoRuntimeArtifactsService extends WagoRuntimeArtifactCatalog {
  constructor() {
    // Existing application setting and exact default from apps/api/src/config/storage.config.ts.
    // Plugin providers are constructed before the host ModuleRef is available.
    super(resolve(process.env.STORAGE_ROOT ?? join(process.cwd(), 'storage')));
  }
}
