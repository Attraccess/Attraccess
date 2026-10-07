import type { DataSource } from 'typeorm';
import { Attractap, AttractapCrashReport, Resource, ResourceBillingConfiguration } from '@attraccess/database-entities';
import { ensureEntity } from './migration-seed-storage.test-fixture';
export async function migrationReaderSeeds(dataSource: DataSource, seedTag: string, resource: Resource) {
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
