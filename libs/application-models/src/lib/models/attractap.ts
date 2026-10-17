import { Resource } from './resource';

interface AttractapCapabilities {
  resourceSelection: boolean;
  resourceActionSelection: boolean;
  cardEnrollment: boolean;
  hasLeds: boolean;
}

export interface AttractapFirmwareVersion {
  name: string | null;
  variant: string | null;
  version: string | null;
  capabilities: AttractapCapabilities;
}

export interface Attractap {
  id: number;
  name: string;
  apiTokenHash: string;
  resources: Resource[];
  lastConnection: Date;
  firstConnection: Date;
  ledBrightness: number;
  firmware: AttractapFirmwareVersion;
}
