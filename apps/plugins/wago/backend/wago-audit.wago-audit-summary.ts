export function wagoAuditSummary(snapshot: unknown): WagoAuditSummary {
  const value = snapshot as { physicalPoints?: unknown; logicalChannels?: unknown } | null;
  return {
    physicalPointCount: Array.isArray(value?.physicalPoints) ? value.physicalPoints.length : 0,
    logicalChannelCount: Array.isArray(value?.logicalChannels) ? value.logicalChannels.length : 0,
  };
}
export interface WagoAuditSummary {
  physicalPointCount: number;
  logicalChannelCount: number;
}
