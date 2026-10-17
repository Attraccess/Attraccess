import { Resource } from './resource';

export interface ResourceBillingConfiguration {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  resourceId: number;
  resource: Resource;
  creditsPerUsage: number;
  creditsPerMinute: number;
  creditsPerOperatingMinute: number;
}
