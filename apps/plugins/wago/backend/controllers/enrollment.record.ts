export interface WagoEnrollment {
  id: number;
  mqttServerId: number;
  hardwareId: string;
  secretHash: string;
  identity: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  consumedAt: string | null;
}
