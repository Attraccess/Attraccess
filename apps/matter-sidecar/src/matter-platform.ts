import type { CommissioningProgressPayload } from '@attraccess/matter-contract';
import type { SidecarConfig } from './config';
import type { CommissioningService, CommissioningTuning } from './commissioning/service';
import { FabricManager, type FabricManagerOptions } from './fabric/manager';
import type { Logger } from './logger';
import { SIDECAR_VERSION, loadedMatterJsVersion } from './version';

export type MatterPlatform = {
  version: string;
  /** The persistent fabric state. Absent for stand-ins that simulate Matter features. */
  fabric?: FabricManager;
  /** Commissioning of IP-reachable devices. Present together with `fabric`. */
  commissioning?: CommissioningService;
  /** Releases matter.js resources. Idempotent. */
  close(): Promise<void>;
};

/** Timings and seams tests may override. The shipped sidecar uses the defaults. */
export type FabricTuning = Pick<FabricManagerOptions, 'stageTtlMs' | 'pendingTtlMs' | 'createController'> & {
  commissioning?: CommissioningTuning & {
    /** Trusts the matter.js test PAAs (and never reaches the DCL) so the virtual test device passes strict attestation. */
    trustTestPaa?: boolean;
  };
};

export type PlatformContext = {
  config: SidecarConfig;
  logger: Logger;
  /** Publishes `fabric.changed` on the event stream. */
  onFabricChanged: ConstructorParameters<typeof FabricManager>[0]['onFabricChanged'];
  /** Publishes `commissioning.progress` on the event stream. */
  onCommissioningProgress?: (payload: CommissioningProgressPayload) => void;
};

/**
 * Loads matter.js and opens the sidecar's persistent storage. Loading alone opens no Matter ports. The controller (UDP,
 * mDNS) starts only when a complete fabric is found in `MATTER_SIDECAR_STORAGE_DIR`; the sidecar never creates one
 * by itself.
 */
export async function loadMatterPlatform(
  context: PlatformContext,
  { commissioning: commissioningTuning, ...tuning }: FabricTuning = {},
): Promise<MatterPlatform> {
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
  // Loaded here, not at the top, so importing this module opens no matter.js (see the note above).
  const { AttestationTrust } = require('./commissioning/trust') as typeof import('./commissioning/trust');
  const { CommissioningService: Service } =
    require('./commissioning/service') as typeof import('./commissioning/service');
  const trust = new AttestationTrust({
    storageDir: context.config.storageDir,
    refresh: context.config.dclRefresh,
    logger: context.logger,
    trustTestPaa: commissioningTuning?.trustTestPaa,
  });
  const commissioning = new Service({
    manager: fabric,
    trust,
    logger: context.logger,
    allowAttestationOverride: context.config.allowAttestationOverride,
    publish: (payload) => context.onCommissioningProgress?.(payload),
    tuning: {
      ...commissioningTuning,
      tolerateFindings: commissioningTuning?.trustTestPaa
        ? ['TrustedAsTestCertificate', 'CertificationTypeTest', ...(commissioningTuning.tolerateFindings ?? [])]
        : commissioningTuning?.tolerateFindings,
    },
  });
  return {
    version,
    fabric,
    commissioning,
    close: async () => {
      await fabric.close();
      await trust.close();
    },
  };
}
