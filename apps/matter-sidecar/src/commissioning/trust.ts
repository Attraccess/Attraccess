import { Bytes, Environment, Seconds } from '@matter/main';
import { DclCertificateService, TestCert_PAA_FFF1_Cert, TestCert_PAA_NoVID_Cert } from '@matter/main/protocol';
import { NodeJsEnvironment } from '@matter/nodejs';
import { join } from 'node:path';
import type { Logger } from '../logger';
import seed from '../../trust/dcl-seed.json';

type SeedEntry = {
  subjectKeyId: string;
  derHex: string;
  kind: 'production' | 'test';
  notBefore?: string;
  notAfter?: string;
};
type SeedFile = { builtAt: string; paaRoots: SeedEntry[]; cdSigners: SeedEntry[] };

/** Directory below the sidecar storage that holds the DCL cache. It is not part of the fabric storage, so backups ignore it. */
export const DCL_CACHE_DIR = 'dcl-cache';

/** When the bundled snapshot of the production PAA roots and CD signers was built (see scripts/refresh-dcl-seed.mjs). */
export const DCL_SEED_BUILT_AT = (seed as SeedFile).builtAt;

async function* production(entries: SeedEntry[]): AsyncGenerator<SeedEntry> {
  // Production entries only: the snapshot never carries test certificates, and none would be trusted if it did.
  for (const entry of entries) if (entry.kind === 'production') yield entry;
}

export type TrustOptions = {
  storageDir: string;
  /** Refresh from the CSA production DCL (default). Off: the trust store is the bundled snapshot and its cache. */
  refresh: boolean;
  logger: Logger;
  /**
   * Test only (a seam like `FabricTuning`, unreachable from the environment or HTTP): additionally trusts the
   * matter.js test PAAs, which the virtual test device chains to, and never talks to the DCL.
   */
  trustTestPaa?: boolean;
};

/**
 * The attestation trust store: a `DclCertificateService` seeded with the production snapshot shipped in the build.
 * With `refresh` it also refreshes from the CSA production DCL when that is reachable (production only, never test
 * certificates) and caches what it learns in `<storageDir>/dcl-cache`. Without a network it works from seed and cache.
 */
export class AttestationTrust {
  #service: Promise<DclCertificateService> | undefined;
  #closed = false;

  constructor(private readonly options: TrustOptions) {}

  /** Opens the service on first use, so a sidecar that never commissions never touches the DCL. */
  service(): Promise<DclCertificateService> {
    if (this.#closed) throw new Error('The attestation trust store is closed.');
    this.#service ??= this.#open().catch((error: unknown) => {
      this.#service = undefined;
      throw error;
    });
    return this.#service;
  }

  async #open(): Promise<DclCertificateService> {
    const { options } = this;
    const environment: Environment = NodeJsEnvironment();
    const cacheDir = join(options.storageDir, DCL_CACHE_DIR);
    environment.vars.set('path.root', cacheDir);
    environment.vars.set('storage.path', cacheDir);
    const file = seed as SeedFile;
    const service = new DclCertificateService(environment, {
      fetchTestCertificates: false,
      acceptTestCertificates: options.trustTestPaa === true,
      offline: !options.refresh || options.trustTestPaa === true,
      timeout: Seconds(5),
      seed: {
        paaRoots: { builtAt: file.builtAt, expectedCount: file.paaRoots.length, entries: production(file.paaRoots) },
        cdSigners: { builtAt: file.builtAt, expectedCount: file.cdSigners.length, entries: production(file.cdSigners) },
      },
    });
    await service.construction;
    if (options.trustTestPaa) {
      for (const cert of [TestCert_PAA_NoVID_Cert, TestCert_PAA_FFF1_Cert]) {
        await service.addCertificate(Bytes.of(cert), 'PAA', { isProduction: false });
      }
    }
    options.logger('info', 'attestation trust store ready', {
      seedBuiltAt: file.builtAt,
      certificates: service.certificates.length,
      refresh: options.refresh && !options.trustTestPaa,
    });
    return service;
  }

  async close(): Promise<void> {
    this.#closed = true;
    const service = await this.#service?.catch(() => undefined);
    await service?.close();
  }
}
