import type { DataSource } from 'typeorm';
import {
  Attractap,
  AttractapCrashReport,
  AttractapReaderIdentity,
  Resource,
  ResourceBillingConfiguration,
} from '@attraccess/database-entities';
import { ensureEntity } from '../seed-storage.test-fixture';
import { readerSecurityFixture } from '../../../../attractap/security/reader-security.test-fixture';
export async function migrationReaderSeeds(
  dataSource: DataSource,
  seedTag: string,
  resource: Resource,
  enrollReader = true,
) {
  const attractapRepo = dataSource.getRepository(Attractap);

  const billingConfigRepo = dataSource.getRepository(ResourceBillingConfiguration);

  const attractapCrashReportRepo = dataSource.getRepository(AttractapCrashReport);

  const attractap = await ensureEntity(attractapRepo, () => ({
    name: `Seed Reader ${seedTag}`,
    apiTokenHash: `seed-token-${seedTag}`,
    firmware: {
      name: 'Seed Firmware',
      variant: 'seed',
      version: '1.0.0',
      capabilities: {
        resourceSelection: true,
        resourceActionSelection: false,
        cardEnrollment: true,
      },
    },
  }));

  // Public development credentials only. This seed exercises schema round trips,
  // not production enrollment or hardware qualification.
  if (enrollReader)
    await ensureEntity(dataSource.getRepository(AttractapReaderIdentity), () => {
      const fixture = readerSecurityFixture();
      try {
        const identity = fixture.identity;
        return {
          readerId: attractap.id,
          certificatePem: identity.certificatePem,
          certificateFingerprint: identity.certificateFingerprint,
          publicKeyFingerprint: identity.publicKeyFingerprint,
          installationId: identity.installationId,
          generation: 1,
          validFrom: identity.validFrom,
          validUntil: identity.validUntil,
          enrollmentClass: 'development',
          manifestDigest: identity.manifestDigest,
          revokedAt: null,
          retiredAt: null,
        };
      } finally {
        fixture.cleanup();
      }
    });

  await ensureEntity(attractapCrashReportRepo, () => ({
    attractapId: attractap.id,
    resetReason: 'TASK_WDT',
    heapFreeBytes: 48213,
    largestFreeBlockBytes: 20480,
    uptimeBeforeResetMs: 372000,
    wsState: 'CONNECTED',
    wifiState: 'GOT_IP',
    firmwareVersion: '1.0.0',
    coredumpSize: null,
    coredump: null,
  }));

  await ensureEntity(billingConfigRepo, () => ({
    resourceId: resource.id,
    creditsPerUsage: 10,
    creditsPerMinute: 1,
  }));
}
