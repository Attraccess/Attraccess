import type { DevelopmentSeedData } from './tooling';
export interface BackendCapabilities {
  readonly independentWriters: boolean;
  readonly fileBacked: boolean;
}

/** Backend identity is separate from session storage and plugin capabilities. */
export interface DatabaseBackend {
  readonly type: string;
  readonly capabilities: BackendCapabilities;
  seedDevelopmentData(database: string, input: DevelopmentSeedData): Promise<{ userId: number }>;
  checkUsageIntegrity(database: string): Promise<void>;
}

/** Error inspection belongs to the selected engine, not HTTP transport. */
export abstract class DatabaseErrors {
  abstract readonly readOnlyGuidance: string;
  abstract isReadOnly(error: unknown): boolean;
}
