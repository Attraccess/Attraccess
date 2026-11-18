export enum ResourceHealthStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
}

export enum ResourceHealthSource {
  PAYLOAD = 'payload',
  HEARTBEAT = 'heartbeat',
  MANUAL = 'manual',
}
