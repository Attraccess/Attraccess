import { RequestSupervisedSessionDto } from '@attraccess/react-query-client';
import { ResourceUsage } from '@attraccess/react-query-client';
export type Phase = 'select' | 'waiting' | 'timeout' | 'rejected' | 'error';

export interface SupervisedStartModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceId: number;
  /** The start payload gathered from the normal start flow, minus the approval channel. */
  requestBody: Omit<RequestSupervisedSessionDto, 'supervisorUserId' | 'readerId'>;
  onApproved: (session: ResourceUsage) => void;
}
