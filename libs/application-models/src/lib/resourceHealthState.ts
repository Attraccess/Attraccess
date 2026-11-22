export enum ResourceHealthStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
}

export enum ResourceHealthSource {
  PAYLOAD = 'payload',
  HEARTBEAT = 'heartbeat',
  MANUAL = 'manual',
  /** Reported by a plugin through its resource health seam. */
  PLUGIN = 'plugin',
}
