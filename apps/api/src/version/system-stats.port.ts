export interface SystemCounts {
  usersTotal: number;
  resourcesTotal: number;
  projectsTotal: number;
  /** Published, running machine sessions. */
  activeResourceUsageSessions: number;
  /** Sessions of signed-in users that have not expired. */
  activeAuthSessions: number;
}

/** Read-only totals for the system information page. */
export interface SystemStatsStore {
  readCounts(): Promise<SystemCounts>;
}

export const SYSTEM_STATS_STORE = Symbol.for('attraccess.version.system-stats-store');
