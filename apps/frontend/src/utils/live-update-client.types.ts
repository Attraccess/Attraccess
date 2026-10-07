import { LiveSubscription } from '@attraccess/shared';

export type Consumer = {
  update: (payload: unknown) => void;
  restore?: () => void;
  unavailable?: () => void;
  hasResourceState: boolean;
};
type ResourceState = { resourceId: number; inUse: boolean; timestamp?: string };
export type Entry = {
  subscription: LiveSubscription;
  consumers: Set<Consumer>;
  snapshot?: ResourceState;
  rejected?: boolean;
  unavailable?: boolean;
};
export interface Transport {
  id: string;
  abort: AbortController;
  ready: boolean;
  dirty: boolean;
  syncing: boolean;
  revision: number;
  lastPacket: number;
}
