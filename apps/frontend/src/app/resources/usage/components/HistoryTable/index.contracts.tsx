import { ResourceUsage } from '@attraccess/react-query-client';

export interface HistoryTableProps {
  resourceId: number;
  showAllUsers?: boolean;
  canUpdateResources: boolean;
  onSessionClick: (session: ResourceUsage) => void;
  projectPlaceholder: string;
  resolveProjectId: (session: ResourceUsage) => number | null;
  updatingSessionIds: Record<number, boolean>;
  onProjectChange: (session: ResourceUsage, projectId: number | undefined) => void;
  canViewOperatingDuration: boolean;
}

export interface ProjectAssignmentCellProps {
  session: ResourceUsage;
  canEdit: boolean;
  projectId: number | null;
  isUpdating: boolean;
  placeholder: string;
  unassignedLabel: string;
  onChange: (projectId: number | undefined) => void;
}
