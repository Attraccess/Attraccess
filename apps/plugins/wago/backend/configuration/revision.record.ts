export type WagoConfigurationRevisionState = 'pending' | 'published' | 'applied' | 'rejected';

export interface WagoConfigurationRevision {
  id: number;
  controllerId: number;
  revision: number;
  snapshot: string;
  presetProvenance?: string | null;
  contentHash: string;
  state: WagoConfigurationRevisionState;
  rejectionErrors: string | null;
  rejectionAcknowledgedAt: string | null;
  rejectionAcknowledgedBy: number | null;
  publishedAt: string;
  reportedAt: string | null;
}
