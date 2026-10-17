import { Resource } from './resource';

/** A user-defined counter. Values use fixed-point billionths, with no physical unit. */
export interface ResourceMeter {
  id: number;
  resourceId: number;
  resource: Resource;
  name: string;
  creditsPerUnit: number;
  lifetimeValue: string;
  counterValue: string | null;
  latestObservedAt: Date | null;
}
