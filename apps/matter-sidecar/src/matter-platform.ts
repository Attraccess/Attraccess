import type { SidecarConfig } from './config';
import { FabricManager, type FabricManagerOptions } from './fabric/manager';
import type { Logger } from './logger';
import { SIDECAR_VERSION, loadedMatterJsVersion } from './version';

export type MatterPlatform = {
  version: string;
  /** The persistent fabric state. Absent for stand-ins that simulate Matter features. */
  fabric?: FabricManager;
  /** Releases matter.js resources. Idempotent. */
  close(): Promise<void>;
};

/** Timings and seams tests may override. The shipped sidecar uses the defaults. */
export type FabricTuning = Pick<FabricManagerOptions, 'stageTtlMs' | 'pendingTtlMs' | 'createController'>;

export type PlatformContext = {
  config: SidecarConfig;
  logger: Logger;
  /** Publishes `fabric.changed` on the event stream. */
  onFabricChanged: ConstructorParameters<typeof FabricManager>[0]['onFabricChanged'];
};

/**
 * Loads matter.js and opens the sidecar's persistent storage. Loading alone opens no Matter ports. The controller (UDP,
 * mDNS) starts only when a complete fabric is found in `MATTER_SIDECAR_STORAGE_DIR`; the sidecar never creates one
 * by itself.
 */
export async function loadMatterPlatform(context: PlatformContext, tuning: FabricTuning = {}): Promise<MatterPlatform> {
  require('@matter/main');
  const version = loadedMatterJsVersion();
  const fabric = new FabricManager({
    storageDir: context.config.storageDir,
    matterPort: context.config.matterPort,
    versions: { sidecar: SIDECAR_VERSION, matterJs: version },
    logger: context.logger,
    onFabricChanged: context.onFabricChanged,
    ...tuning,
  });
  try {
    await fabric.init();
  } catch (error) {
    await fabric.close();
    throw error;
  }
  return { version, fabric, close: () => fabric.close() };
}
