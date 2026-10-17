import { Resource } from './resource';

export interface CompanionDevice {
  id: number;
  name: string;
  tokenHash: string;
  resources: Resource[];
  locked: boolean;
  lastConnection: Date;
  firstConnection: Date;
  appVersion: string | null;
}
