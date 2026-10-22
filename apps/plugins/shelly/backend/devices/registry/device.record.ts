import type { AuthState } from '../types';

export interface ShellyDevice {
  id: number;
  name: string;
  ipAddress: string;
  generation: number | null;
  model: string | null;
  authState: AuthState;
  lastProbeAt: string | null;
  lastProbeError: string | null;
  createdAt: string;
  updatedAt: string;
}
