import { ResourceUsage } from '@attraccess/react-query-client';

export interface UsageNotesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  session: ResourceUsage | null;
  projectLabel?: string;
  projectPlaceholder?: string;
  resolveProjectId?: (session: ResourceUsage) => number | null;
  updatingSessionIds?: Record<number, boolean>;
  onProjectChange?: (session: ResourceUsage, projectId: number | undefined) => void;
  operatingDurationMs?: number;
  onOpenBilling?: () => void;
  error?: boolean;
  onRetry?: () => void;
  billingError?: boolean;
  onRetryBilling?: () => void;
  isRetryingBilling?: boolean;
  operatingDurationError?: boolean;
  onRetryOperatingDuration?: () => void;
  isRetryingOperatingDuration?: boolean;
}
