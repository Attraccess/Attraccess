import type { DataSource } from 'typeorm';
import { AttractapSecureBootKey, AttractapSecureConversion } from '@attraccess/database-entities';
import { ensureEntity } from '../seed-storage.test-fixture';

export async function migrationSecureBootSeeds(dataSource: DataSource, seedTag: string) {
  await ensureEntity(dataSource.getRepository(AttractapSecureBootKey), () => ({
    role: 'recovery' as const,
    publicKeyPem: `seed-public-key-${seedTag}`,
    digest: `seed-digest-${seedTag}`,
    fingerprint: `seed-fingerprint-${seedTag}`,
    privateKeyEncrypted: null,
    verifiedAt: new Date(),
  }));
  // An ended conversion: history rows are never active, so the seed cannot collide with the one-active index.
  await ensureEntity(dataSource.getRepository(AttractapSecureConversion), () => ({
    readerId: 1,
    state: 'cancelled' as const,
    active: false,
    target: {
      firmwareName: 'attractap',
      variant: `seed-${seedTag}`,
      version: '2.14.0',
      secureVersion: 1,
      appSha256: 'a'.repeat(64),
      appSize: 4096,
      bootloaderSha256: 'b'.repeat(64),
      bootloaderSize: 4096,
    },
    digest0: 'c'.repeat(64),
    digest1: 'd'.repeat(64),
    stateChangedAt: new Date(),
    endedAt: new Date(),
  }));
}
