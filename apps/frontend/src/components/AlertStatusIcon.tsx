import { AlertIndicator } from '@heroui/react';
import { AlertCircleIcon, AlertTriangleIcon, CheckCircle2Icon, InfoIcon } from 'lucide-react';

type AlertStatus = 'default' | 'accent' | 'success' | 'warning' | 'danger';

const iconByStatus = {
  default: InfoIcon,
  accent: InfoIcon,
  success: CheckCircle2Icon,
  warning: AlertTriangleIcon,
  danger: AlertCircleIcon,
} as const;

interface Props {
  status: AlertStatus;
}

export function AlertStatusIcon({ status }: Props) {
  const Icon = iconByStatus[status];
  return (
    <AlertIndicator>
      <Icon />
    </AlertIndicator>
  );
}
