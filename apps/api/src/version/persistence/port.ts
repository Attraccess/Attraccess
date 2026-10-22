export interface SystemCounts {
  usersTotal: number;
  resourcesTotal: number;
  projectsTotal: number;
  activeResourceUsageSessions: number;
  activeAuthSessions: number;
}

export abstract class VersionPersistence {
  /** Counts match the current lifecycle visibility and unexpired authentication sessions. */
  abstract systemCounts(at: Date): Promise<SystemCounts>;
}
