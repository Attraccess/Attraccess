import { RequestSupervisedSessionDto, ResourceUsage } from '@attraccess/react-query-client';

export interface SupervisedStartModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceId: number;
  /** The start payload gathered from the normal start flow, minus the approval channel. */
  requestBody: Omit<RequestSupervisedSessionDto, 'supervisorUserId' | 'readerId'>;
  onApproved: (session: ResourceUsage) => void;
}
