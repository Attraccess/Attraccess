export interface WagoConfigurationDraft {
  id: number;
  controllerId: number;
  snapshot: string;
  reviewedHash: string | null;
  presetProvenance: string | null;
  updatedAt: string;
}
