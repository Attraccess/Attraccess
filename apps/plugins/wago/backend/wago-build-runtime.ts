import { ConflictException } from '@nestjs/common';
import { join } from 'node:path';
import { WagoRuntimeArtifactCatalog, openArtifactFile } from './wago-runtime-artifacts';
import type { RuntimeArtifactMetadata, RuntimeArtifactUpload, VerifiedRuntimeArtifact } from './wago-runtime-artifacts';
import { validateRuntimeManifest } from './wago-runtime-artifacts-verification';

export interface BuildRuntimeArtifact extends RuntimeArtifactMetadata {
  readonly buildId: string;
  /** Docker config digest, not the outer tar digest or a mutable repository tag. */
  readonly imageId: string;
}

/** The server build supplies assets outside the size-limited npm plugin archive.
 * Import storage is only an immutable delivery cache; its mutable pointer is ignored.
 * Two server builds sharing storage cannot select one another's desired runtime.
 */
export class WagoBuildRuntimeCatalog extends WagoRuntimeArtifactCatalog {
  private build?: Promise<BuildRuntimeArtifact>;

  constructor(
    storageRoot: string,
    private readonly buildDirectory: string,
  ) {
    super(storageRoot);
  }

  override async onModuleInit() {
    await super.onModuleInit();
    await this.current();
  }

  override async import(upload: RuntimeArtifactUpload): Promise<never> {
    for (const stream of Object.values(upload)) stream.destroy();
    throw new ConflictException('The deployed server build owns the CC100 runtime. Deploy a new build to change it.');
  }

  override current(): Promise<BuildRuntimeArtifact> {
    if (!this.build) {
      this.build = this.loadBuild().catch((error) => {
        this.build = undefined;
        throw error;
      });
    }
    return this.build;
  }

  override async list(): Promise<BuildRuntimeArtifact[]> {
    return [await this.current()];
  }

  override async acquire(digest?: string): Promise<VerifiedRuntimeArtifact & BuildRuntimeArtifact> {
    const build = await this.current();
    if (digest && digest !== build.digest) throw new ConflictException('Runtime does not belong to this server build.');
    return Object.freeze({ ...(await super.acquire(build.digest)), ...build });
  }

  private async loadBuild(): Promise<BuildRuntimeArtifact> {
    const descriptor = await openArtifactFile(join(this.buildDirectory, 'release.json'));
    let release: Record<string, unknown>;
    try {
      if ((await descriptor.stat()).size > 4096) throw new Error('Oversized build runtime descriptor');
      release = JSON.parse(await descriptor.readFile('utf8'));
      if (
        !release ||
        Object.keys(release).sort().join(',') !== 'buildId,bundleBytes,bundleSha256,imageId,manifest,schemaVersion' ||
        release.schemaVersion !== 1 ||
        typeof release.buildId !== 'string' ||
        !/^[a-f0-9]{40}$/.test(release.buildId) ||
        typeof release.imageId !== 'string' ||
        !/^sha256:[a-f0-9]{64}$/.test(release.imageId) ||
        typeof release.bundleSha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(release.bundleSha256)
      )
        throw new Error('Invalid build runtime descriptor');
      validateRuntimeManifest(release.manifest);
    } finally {
      await descriptor.close();
    }
    const bundle = await openArtifactFile(join(this.buildDirectory, 'wago-cc100-runtime.tar'));
    try {
      const checksum = await openArtifactFile(join(this.buildDirectory, 'wago-cc100-runtime.tar.sha256'));
      try {
        const metadata = await super.cache({
          bundle: bundle.createReadStream({ autoClose: false }),
          checksum: checksum.createReadStream({ autoClose: false }),
        });
        if (
          metadata.digest !== release.bundleSha256 ||
          metadata.bytes !== release.bundleBytes ||
          JSON.stringify(metadata.manifest) !== JSON.stringify(validateRuntimeManifest(release.manifest))
        )
          throw new Error('Runtime assets do not match the server build descriptor');
        return Object.freeze({ ...metadata, imageId: release.imageId as string, buildId: release.buildId as string });
      } finally {
        await checksum.close();
      }
    } finally {
      await bundle.close();
    }
  }
}

/** Repository tags and tar compression are not runtime identity. */
export function sameRuntimeImage(
  left: { image: string; imageId?: string },
  right: { image: string; imageId?: string },
) {
  if (left.imageId && right.imageId) return left.imageId === right.imageId;
  const digest = left.image.split('@')[1];
  return Boolean(digest) && digest === right.image.split('@')[1];
}
