import { selectDatabaseBackend } from './backend.registry';
export { resolveBackendConfig } from './backend.config';
export { resolveStorageRoot } from '../config/storage-path';

export interface SeedFixture {
  resourceGroups?: Array<{ name: string; description?: string | null }>;
  resources?: Array<{ name: string; type: 'machine' | 'door'; description?: string | null; groups?: string[] }>;
  roles?: Array<{ key: string; name: string; description?: string; permissions: string[] }>;
  userRoles?: Array<{ username: string; roleKey: string }>;
}
export interface DevelopmentSeedData {
  admin: { username: string; email: string; password: string };
  demo?: boolean;
  fixture?: SeedFixture | null;
}

/** Standalone bundle entry. Selecting a backend never opens a connection or boots HTTP services. */
export function seedDevelopmentData(database: string, input: DevelopmentSeedData): Promise<{ userId: number }> {
  return selectDatabaseBackend().seedDevelopmentData(database, input);
}
export function checkUsageIntegrity(database: string): Promise<void> {
  return selectDatabaseBackend().checkUsageIntegrity(database);
}
