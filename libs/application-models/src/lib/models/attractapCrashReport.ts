import { Attractap } from './attractap';

export interface AttractapCrashReport {
  id: number;
  attractapId: number;
  resetReason: string;
  rebootReason: string | null;
  heapFreeBytes: number | null;
  largestFreeBlockBytes: number | null;
  uptimeBeforeResetMs: number | null;
  wsState: string | null;
  wifiState: string | null;
  firmwareVersion: string | null;
  coredumpSize: number | null;
  coredump: Buffer | null;
  coredumpBuildId: string | null;
  symbolicationStatus: string | null;
  symbolizedBacktrace: string | null;
  createdAt: Date;
  attractap: Attractap;
}
