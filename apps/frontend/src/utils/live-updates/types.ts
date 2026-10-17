import type {
  BillingTransaction,
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

export interface LivePayloads {
  resource: { resourceId?: number; eventType?: string; inUse?: boolean; timestamp?: string };
  'flow-logs': ResourceFlowLog;
  billing: BillingTransaction;
  messaging: Message;
  notifications: SystemNotificationLiveEvent;
  supervision: SupervisionLiveEvent;
}
