export interface MetricsSnapshot {
  users: number;
  resources: number;
  projects: number;
  groups: number;
  mqttServers: number;
  activeUsageSessions: number;
  activeAuthSessions: number;
  localeCounts: Array<{ locale: string | null; count: number }>;
}

export abstract class MetricsPersistence {
  abstract snapshot(at: Date): Promise<MetricsSnapshot>;
}

export interface QueryObservation {
  method: 'select' | 'insert' | 'update' | 'delete' | 'other';
  entity: string;
  seconds: number;
  errorType?: string;
}

export interface QueryObserver {
  enabled(): boolean;
  record(observation: QueryObservation): void;
}

/** Engine instrumentation emits bounded labels and timings, never query text or parameters. */
export abstract class MetricsQueryInstrumentation {
  abstract install(observer: QueryObserver): void;
}
