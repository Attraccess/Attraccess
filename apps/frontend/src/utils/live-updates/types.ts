import type { MqttExplorerEvent } from '@attraccess/shared';
import type {
  BillingTransaction,
  MassIntroductionLiveEventDto,
  Message,
  ResourceFlowLog,
  SupervisionRequestDto,
} from '@attraccess/react-query-client';

export interface SystemNotificationLiveEvent {
  category?: string;
  title: string;
  body?: string;
  url?: string;
}

export enum SupervisionLiveEventType {
  REQUESTED = 'requested',
  EXPIRED = 'expired',
  RESOLVED = 'resolved',
  REJECTED = 'rejected',
}

export interface SupervisionLiveEvent {
  type: SupervisionLiveEventType;
  requestId: string;
  request: SupervisionRequestDto | null;
}

// Shared with the API (libs/shared/src/lib/mqtt-explorer.ts). A failed broker
// subscription reaches the client as a rejected frame (onUnavailable).
export type {
  MqttExplorerEvent as MqttExplorerLiveEvent,
  MqttExplorerMessage as MqttExplorerLiveMessage,
} from '@attraccess/shared';
export interface LivePayloads {
  resource: {
    resourceId?: number;
    eventType?: string;
    inUse?: boolean;
    activeSessionCount?: number;
    maxParallelSessions?: number;
    timestamp?: string;
  };
  'flow-logs': ResourceFlowLog;
  billing: BillingTransaction;
  messaging: Message;
  notifications: SystemNotificationLiveEvent;
  supervision: SupervisionLiveEvent;
  'mass-introduction': MassIntroductionLiveEventDto;
  'mqtt-messages': MqttExplorerEvent;
}
