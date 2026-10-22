/** Never expose this recovery record through an API. */
export interface WagoCredentialRotation {
  controllerId: number;
  revision: number;
  credentialEpoch: string;
  phase: 'provisioning' | 'pending' | 'completed';
  mqttServerId: number;
  prefix: string;
  token: string;
  encryptedCredentials: string | null;
}
