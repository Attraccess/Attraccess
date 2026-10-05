import type { Resource } from '@attraccess/database-entities';
import type { MeteringRunContext } from './node-executors';

export interface FlowExecutionOptions {
  lifecycleAttemptId?: string;
  lifecycleCandidateCancellation?: boolean;
  metering?: MeteringRunContext;
}

export interface UsageEventData {
  resource: {
    id: number;
    name: string;
    metadata?: Record<string, unknown> | null;
  };
  event: {
    timestamp: string;
  };
  usage: {
    start: string;
    end: string;
  };
  user: {
    id: number;
    username: string;
    externalIdentifier: string;
  };
  previousUser?: {
    id: number;
    username: string;
    externalIdentifier: string;
  };
}

export interface FlowResourceContext {
  id: number;
  name?: string;
  type?: Resource['type'];
  metadata?: Resource['metadata'];
}
