// Alert with a status icon, mirroring the host's AlertStatusIcon
// (apps/frontend/src/components/AlertStatusIcon.tsx) — host components are not
// shared with plugins over module federation, so the pattern is replicated.
//
// The icon is not decoration: HeroUI colours only the alert's indicator and
// title by status, so an alert without one renders in neutral grey and a danger
// alert is indistinguishable from an informational one.
import { Alert, AlertContent, AlertDescription, AlertIndicator, AlertTitle } from '@heroui/react';
import { AlertCircleIcon, AlertTriangleIcon, CheckCircle2Icon, InfoIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type AlertStatus = 'default' | 'accent' | 'success' | 'warning' | 'danger';

const iconByStatus = {
  default: InfoIcon,
  accent: InfoIcon,
  success: CheckCircle2Icon,
  warning: AlertTriangleIcon,
  danger: AlertCircleIcon,
} as const;

export function StatusAlert({
  status,
  title,
  children,
  dataCy,
}: {
  status: AlertStatus;
  title: string;
  children: ReactNode;
  dataCy?: string;
}) {
  const Icon = iconByStatus[status];
  return (
    <Alert status={status}>
      <AlertIndicator>
        <Icon />
      </AlertIndicator>
      <AlertContent>
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription data-cy={dataCy}>{children}</AlertDescription>
      </AlertContent>
    </Alert>
  );
}
