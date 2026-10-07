import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WagoRuntimeArtifactCatalog, WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { WagoBuildRuntimeCatalog, sameRuntimeImage } from './wago-build-runtime';
import { registerRuntimeArtifactCatalogIsolatedDiskIgnoresALegacyImportedReleaseWhenLocalBuildAssetsHaveNotBeenInstalled } from './wago-runtime-artifacts.runtime-artifact-catalog-isolated-disk-ignores-a-legacy-imported-release-when-local-build-assets-have-not-been-installed.test-cases';
import { registerRuntimeArtifactCatalogIsolatedDiskRequiresBundledRuntimeAssetsWhenStartingInProduction } from './wago-runtime-artifacts.runtime-artifact-catalog-isolated-disk-requires-bundled-runtime-assets-when-starting-in-production.test-cases';
import { registerRuntimeArtifactCatalogIsolatedDiskUsesExactlyCwdStorageWhenTheExistingApplicationSettingIsAbsent } from './wago-runtime-artifacts.runtime-artifact-catalog-isolated-disk-uses-exactly-cwd-storage-when-the-existing-application-setting-is-absent.test-cases';
import { registerRuntimeArtifactCatalogIsolatedDiskReconcilesKilledOwnersOnAccessWhileRetainingActiveOwnersImmutableObjectsAndUnknownEntri } from './wago-runtime-artifacts.runtime-artifact-catalog-isolated-disk-reconciles-killed-owners-on-access-while-retaining-active-owners-immutable-objects-and-unknown-entri.test-cases';
import { registerRuntimeArtifactCatalogIsolatedDiskBoundsStartupReconciliationAndContinuesBeyondRetainedEntriesOnLaterAccesses } from './wago-runtime-artifacts.runtime-artifact-catalog-isolated-disk-bounds-startup-reconciliation-and-continues-beyond-retained-entries-on-later-accesses.test-cases';
import { registerRuntimeArtifactCatalogIsolatedDiskRetainsRemoteOwnersAndMalformedOwnershipMarkers } from './wago-runtime-artifacts.runtime-artifact-catalog-isolated-disk-retains-remote-owners-and-malformed-ownership-markers.test-cases';
import { registerRuntimeArtifactCatalogIsolatedDiskDoesNotLetTheManifestCopyTaskCacheAndRestoreStaleRuntimeFrontendBundles } from './wago-runtime-artifacts.runtime-artifact-catalog-isolated-disk-does-not-let-the-manifest-copy-task-cache-and-restore-stale-runtime-frontend-bundles.test-cases';
import { registerRuntimeArtifactCatalogIsolatedDiskAlwaysPackagesAndVerifiesTheFreshGeneratedOutputsInsteadOfRestoringCachedArchives } from './wago-runtime-artifacts.runtime-artifact-catalog-isolated-disk-always-packages-and-verifies-the-fresh-generated-outputs-instead-of-restoring-cached-archives.test-cases';
import { registerRuntimeArtifactCatalogIsolatedDiskUsesExistingStorageRootWithoutAccessingThePluginContextOrHostModuleRef } from './wago-runtime-artifacts.runtime-artifact-catalog-isolated-disk-uses-existing-storage-root-without-accessing-the-plugin-context-or-host-module-ref.test-cases';
import { registerRuntimeArtifactCatalogIsolatedDiskPersistsImmutableVerifiedMetadataAndExposesOnlyNonsecretApiMetadata } from './wago-runtime-artifacts.runtime-artifact-catalog-isolated-disk-persists-immutable-verified-metadata-and-exposes-only-nonsecret-api-metadata.test-cases';
import { registerRuntimeArtifactCatalogIsolatedDiskVerifiedlyBackfillsMetadataForCatalogObjectsWrittenBeforeMetadataPersistence } from './wago-runtime-artifacts.runtime-artifact-catalog-isolated-disk-verifiedly-backfills-metadata-for-catalog-objects-written-before-metadata-persistence.test-cases';
import { registerRuntimeArtifactCatalogIsolatedDiskAtomicallyBackfillsMetadataForConcurrentReaders } from './wago-runtime-artifacts.runtime-artifact-catalog-isolated-disk-atomically-backfills-metadata-for-concurrent-readers.test-cases';
import { registerRuntimeArtifactCatalogIsolatedDiskLeavesNoPartialMetadataWhenBackfillPublicationIsInterrupted } from './wago-runtime-artifacts.runtime-artifact-catalog-isolated-disk-leaves-no-partial-metadata-when-backfill-publication-is-interrupted.test-cases';
import { registerRuntimeArtifactCatalogIsolatedDiskRetainsOldBundlesAcrossConcurrentImportsAndSnapshotsSurviveActivation } from './wago-runtime-artifacts.runtime-artifact-catalog-isolated-disk-retains-old-bundles-across-concurrent-imports-and-snapshots-survive-activation.test-cases';
import { registerRuntimeArtifactCatalogIsolatedDiskValidatesASelectedCatalogArtifactWithoutCreatingADeliverySnapshot } from './wago-runtime-artifacts.runtime-artifact-catalog-isolated-disk-validates-a-selected-catalog-artifact-without-creating-a-delivery-snapshot.test-cases';
import { registerRuntimeArtifactCatalogIsolatedDiskListsBoundedMetadataWithoutRevalidatingRetainedBundles } from './wago-runtime-artifacts.runtime-artifact-catalog-isolated-disk-lists-bounded-metadata-without-revalidating-retained-bundles.test-cases';
import { registerRuntimeArtifactCatalogIsolatedDiskBoundsConcurrentImportsAndReleasesRejectedInputStreams } from './wago-runtime-artifacts.runtime-artifact-catalog-isolated-disk-bounds-concurrent-imports-and-releases-rejected-input-streams.test-cases';
import { registerRuntimeArtifactCatalogIsolatedDiskRejectsSWithoutChangingCurrentOrLeavingTemporaryFiles } from './wago-runtime-artifacts.runtime-artifact-catalog-isolated-disk-rejects-s-without-changing-current-or-leaving-temporary-files.test-cases';
import { registerRuntimeArtifactCatalogIsolatedDiskBoundsTarAndSidecarWritesAndCleansUpStreamErrors } from './wago-runtime-artifacts.runtime-artifact-catalog-isolated-disk-bounds-tar-and-sidecar-writes-and-cleans-up-stream-errors.test-cases';
import { registerRuntimeArtifactCatalogIsolatedDiskRejectsSymlinkStorageTraversalAndAlteredPersistedData } from './wago-runtime-artifacts.runtime-artifact-catalog-isolated-disk-rejects-symlink-storage-traversal-and-altered-persisted-data.test-cases';
import { registerRuntimeArtifactCatalogIsolatedDiskRoundTripsTheCompressedPackagingCliChecksumAndCatalogImportForS } from './wago-runtime-artifacts.runtime-artifact-catalog-isolated-disk-round-trips-the-compressed-packaging-cli-checksum-and-catalog-import-for-s.test-cases';
import { registerRuntimeArtifactCatalogIsolatedDiskPackagesAFixedBuildOwnedDescriptorAndVerifiesItWithoutAManualImport } from './wago-runtime-artifacts.runtime-artifact-catalog-isolated-disk-packages-a-fixed-build-owned-descriptor-and-verifies-it-without-a-manual-import.test-cases';
import { registerRuntimeArtifactCatalogIsolatedDiskRedactsFilesystemFailuresFromTheReadOnlyRuntimeController } from './wago-runtime-artifacts.runtime-artifact-catalog-isolated-disk-redacts-filesystem-failures-from-the-read-only-runtime-controller.test-cases';
import { upload } from './wago-runtime-artifacts.spec.upload';
import { bundle } from './wago-runtime-artifacts.spec.bundle';
import { manifest } from './wago-runtime-artifacts.spec.manifest';
import { image } from './wago-runtime-artifacts.spec.image';
import { tarMember } from './wago-runtime-artifacts.spec.tar-member';

export function defineRuntimeArtifactCatalogIsolatedDiskTests() {
  let root: string;
  let catalog: WagoRuntimeArtifactCatalog;
  beforeEach(async () => {
    jest.replaceProperty(process, 'env', { ...process.env });
    root = await mkdtemp(join(tmpdir(), 'wago-artifact-test-'));
    catalog = new WagoRuntimeArtifactCatalog(root);
  });
  afterEach(async () => {
    await catalog.onModuleDestroy();
    await rm(root, { recursive: true, force: true });
    jest.restoreAllMocks();
  });
  const scope = {
    get root() {
      return root;
    },
    set root(value: typeof root) {
      root = value;
    },
    get catalog() {
      return catalog;
    },
    set catalog(value: typeof catalog) {
      catalog = value;
    },
    get upload() {
      return upload;
    },
    get bundle() {
      return bundle;
    },
    get manifest() {
      return manifest;
    },
    get image() {
      return image;
    },
    get tarMember() {
      return tarMember;
    },
    get dockerImage() {
      return dockerImage;
    },
  };

  registerRuntimeArtifactCatalogIsolatedDiskIgnoresALegacyImportedReleaseWhenLocalBuildAssetsHaveNotBeenInstalled(
    scope,
  );

  registerRuntimeArtifactCatalogIsolatedDiskRequiresBundledRuntimeAssetsWhenStartingInProduction(scope);

  describe('build-owned assets outside the plugin archive', () => {
    const imageId = `sha256:${'b'.repeat(64)}`;
    const buildId = 'c'.repeat(40);
    let owned: WagoBuildRuntimeCatalog;
    let directory: string;
    async function assets(data = bundle(), descriptor: Record<string, unknown> = {}) {
      const digest = createHash('sha256').update(data).digest('hex');
      await writeFile(join(directory, 'wago-cc100-runtime.tar'), data);
      await writeFile(join(directory, 'wago-cc100-runtime.tar.sha256'), digest);
      await writeFile(
        join(directory, 'release.json'),
        JSON.stringify({
          schemaVersion: 1,
          buildId,
          imageId,
          manifest,
          bundleBytes: data.length,
          bundleSha256: digest,
          ...descriptor,
        }),
      );
      return digest;
    }
    beforeEach(async () => {
      directory = await mkdtemp(join(root, 'build-'));
      owned = new WagoBuildRuntimeCatalog(root, directory);
    });
    afterEach(async () => owned.onModuleDestroy());

    it('loads installed local build assets through the same service used by commissioning and updates', async () => {
      process.env.STORAGE_ROOT = root;
      process.env.WAGO_CC100_BUILD_ASSETS_PATH = directory;
      process.env.NODE_ENV = 'development';
      const service = new WagoRuntimeArtifactsService();
      try {
        await service.onModuleInit();
        expect(await service.current()).toBeNull();
        const digest = await assets();
        expect(await service.current()).toMatchObject({ digest, buildId, imageId });
        expect(await service.has()).toBe(true);
        await catalog.import(upload(bundle({ ...manifest, runtimeVersion: '9.0.0' })));
        const snapshot = await service.acquire();
        expect(snapshot).toMatchObject({ digest, buildId, imageId });
        await snapshot.cleanup();
        expect(await service.list()).toHaveLength(1);
      } finally {
        await service.onModuleDestroy();
      }
    });

    it('selects only this build even when another build or a legacy importer changes shared storage', async () => {
      const digest = await assets();
      await owned.onModuleInit();
      await catalog.import(
        upload(
          bundle(
            { ...manifest, image: image.replace(/a{64}/, 'd'.repeat(64)) },
            image.replace(/a{64}/, 'd'.repeat(64)),
          ),
        ),
      );
      expect((await catalog.current())?.digest).not.toBe(digest);
      expect(await owned.current()).toMatchObject({ digest, imageId, buildId });
      expect(await owned.list()).toHaveLength(1);
      const snapshot = await owned.acquire();
      expect(snapshot.imageId).toBe(imageId);
      expect(await readFile(snapshot.path)).toEqual(bundle());
      await snapshot.cleanup();
    });

    it('uses the next server build rather than a persisted old release pointer', async () => {
      const previous = await catalog.import(upload());
      const nextImage = image.replace(/a{64}/, 'e'.repeat(64));
      const nextManifest = { ...manifest, image: nextImage };
      const digest = await assets(bundle(nextManifest, nextImage), { manifest: nextManifest });
      expect(await owned.current()).toMatchObject({ digest, image: nextImage });
      expect((await catalog.current())?.digest).toBe(previous.digest);
    });

    it('rejects importing and acquiring a stale session digest', async () => {
      await assets();
      const source = upload();
      await expect(owned.import(source)).rejects.toThrow('deployed server build owns');
      expect(source.bundle.destroyed).toBe(true);
      await expect(owned.acquire('f'.repeat(64))).rejects.toThrow('does not belong');
    });

    it.each([
      { bundleSha256: 'f'.repeat(64) },
      { bundleBytes: 1 },
      { imageId: 'mutable:latest' },
      { buildId: 'main' },
      { manifest: { ...manifest, protocolVersion: '2.0.0' } },
    ])('fails closed for mismatched/incompatible build metadata %j', async (descriptor) => {
      await assets(bundle(), descriptor);
      await expect(owned.onModuleInit()).rejects.toThrow();
      expect(await owned.has()).toBe(false);
    });

    it('fails closed with missing assets and retries after they are made available', async () => {
      expect(await owned.has()).toBe(false);
      await assets();
      expect(await owned.has()).toBe(true);
    });

    it('does not treat a changed tar, tag, or build ID as a new Docker image', () => {
      expect(
        sameRuntimeImage({ image, imageId }, { image: image.replace('runtime@', 'runtime:other@'), imageId }),
      ).toBe(true);
      expect(sameRuntimeImage({ image }, { image: image.replace('runtime@', 'runtime:other@') })).toBe(true);
      expect(sameRuntimeImage({ image, imageId }, { image, imageId: `sha256:${'d'.repeat(64)}` })).toBe(false);
    });
  });
  registerRuntimeArtifactCatalogIsolatedDiskUsesExactlyCwdStorageWhenTheExistingApplicationSettingIsAbsent(scope);
  registerRuntimeArtifactCatalogIsolatedDiskReconcilesKilledOwnersOnAccessWhileRetainingActiveOwnersImmutableObjectsAndUnknownEntri(
    scope,
  );
  registerRuntimeArtifactCatalogIsolatedDiskBoundsStartupReconciliationAndContinuesBeyondRetainedEntriesOnLaterAccesses(
    scope,
  );
  registerRuntimeArtifactCatalogIsolatedDiskRetainsRemoteOwnersAndMalformedOwnershipMarkers(scope);
  registerRuntimeArtifactCatalogIsolatedDiskDoesNotLetTheManifestCopyTaskCacheAndRestoreStaleRuntimeFrontendBundles(
    scope,
  );

  registerRuntimeArtifactCatalogIsolatedDiskAlwaysPackagesAndVerifiesTheFreshGeneratedOutputsInsteadOfRestoringCachedArchives(
    scope,
  );
  registerRuntimeArtifactCatalogIsolatedDiskUsesExistingStorageRootWithoutAccessingThePluginContextOrHostModuleRef(
    scope,
  );
  registerRuntimeArtifactCatalogIsolatedDiskPersistsImmutableVerifiedMetadataAndExposesOnlyNonsecretApiMetadata(scope);
  registerRuntimeArtifactCatalogIsolatedDiskVerifiedlyBackfillsMetadataForCatalogObjectsWrittenBeforeMetadataPersistence(
    scope,
  );
  registerRuntimeArtifactCatalogIsolatedDiskAtomicallyBackfillsMetadataForConcurrentReaders(scope);
  registerRuntimeArtifactCatalogIsolatedDiskLeavesNoPartialMetadataWhenBackfillPublicationIsInterrupted(scope);
  registerRuntimeArtifactCatalogIsolatedDiskRetainsOldBundlesAcrossConcurrentImportsAndSnapshotsSurviveActivation(
    scope,
  );
  registerRuntimeArtifactCatalogIsolatedDiskValidatesASelectedCatalogArtifactWithoutCreatingADeliverySnapshot(scope);
  registerRuntimeArtifactCatalogIsolatedDiskListsBoundedMetadataWithoutRevalidatingRetainedBundles(scope);
  registerRuntimeArtifactCatalogIsolatedDiskBoundsConcurrentImportsAndReleasesRejectedInputStreams(scope);
  registerRuntimeArtifactCatalogIsolatedDiskRejectsSWithoutChangingCurrentOrLeavingTemporaryFiles(scope);
  registerRuntimeArtifactCatalogIsolatedDiskBoundsTarAndSidecarWritesAndCleansUpStreamErrors(scope);
  registerRuntimeArtifactCatalogIsolatedDiskRejectsSymlinkStorageTraversalAndAlteredPersistedData(scope);
  registerRuntimeArtifactCatalogIsolatedDiskRoundTripsTheCompressedPackagingCliChecksumAndCatalogImportForS(scope);

  registerRuntimeArtifactCatalogIsolatedDiskPackagesAFixedBuildOwnedDescriptorAndVerifiesItWithoutAManualImport(scope);
  const dockerImage = process.env.WAGO_DOCKER_TEST_IMAGE;
  (dockerImage ? it : it.skip)(
    'loads the packaged release image member with a real Docker daemon',
    async () => {
      const exec = promisify(execFile);
      const archive = join(root, 'docker-image.tar');
      if (!dockerImage) throw new Error('Set WAGO_DOCKER_TEST_IMAGE to run this integration test');
      await exec('docker', ['save', '-o', archive, dockerImage]);
      await exec(process.execPath, [
        resolve(__dirname, '../scripts/package-runtime-artifact.mjs'),
        '--image-archive',
        archive,
        '--image',
        image,
        '--version',
        '0.4.0',
        '--out',
        join(root, 'releases'),
      ]);
      const release = join(root, 'releases', (await readdir(join(root, 'releases')))[0]);
      const data = await readFile(join(release, 'wago-cc100-runtime.tar'));
      const importedCatalog = new WagoRuntimeArtifactCatalog(root);
      const imported = await importedCatalog.import(
        upload(data, await readFile(join(release, 'wago-cc100-runtime.tar.sha256'), 'utf8')),
      );
      expect(imported.manifest.runtimeVersion).toBe('0.4.0');
      await importedCatalog.onModuleDestroy();
      const size = parseInt(data.subarray(124, 136).toString('ascii'), 8);
      const compressedImage = join(root, 'image-compressed.tar');
      await writeFile(compressedImage, data.subarray(512, 512 + size));
      const { stdout } = await exec('docker', ['load', '-i', compressedImage], { maxBuffer: 1024 * 1024 });
      expect(stdout).toContain('Loaded image:');
    },
    120000,
  );
  registerRuntimeArtifactCatalogIsolatedDiskRedactsFilesystemFailuresFromTheReadOnlyRuntimeController(scope);

  return scope;
}
