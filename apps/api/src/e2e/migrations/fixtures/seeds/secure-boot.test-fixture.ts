import type { DataSource } from 'typeorm';
import { AttractapSecureBootKey } from '@attraccess/database-entities';
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
}
