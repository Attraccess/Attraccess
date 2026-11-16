import { Resource } from '@attraccess/database-entities';
import { MeteringRunContext } from '../node-executors';

export interface FlowExecutionOptions {
  /** The user whose action started this run (start, stop, takeover, button press); none for MQTT, webhooks etc. */
  actorUserId?: number;
  lifecycleAttemptId?: string;
  lifecycleCandidateCancellation?: boolean;
  metering?: MeteringRunContext;
  /**
   * The resource whose event started this run. Nodes of global flows have no resource of their own; they act on
   * this one. Resource-flow nodes always use their own resource. Unset for runs without a triggering resource.
   */
  triggeringResourceId?: number | null;
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
