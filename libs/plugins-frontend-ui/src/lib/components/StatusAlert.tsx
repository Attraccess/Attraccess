// Alert with a status icon, shared by the host and plugins.
//
// The icon is not decoration: HeroUI colours only the alert's indicator and
// title by status, so an alert without one renders in neutral grey and a danger
// alert is indistinguishable from an informational one.
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@heroui/react';
import type { ReactNode } from 'react';
import { AlertStatusIcon } from './AlertStatusIcon';

interface StatusAlertProps {
  status: 'default' | 'accent' | 'success' | 'warning' | 'danger';
  title: ReactNode;
  children?: ReactNode;
  'data-cy'?: string;
}

export function StatusAlert({ status, title, children, 'data-cy': dataCy }: Readonly<StatusAlertProps>) {
  return (
    <Alert status={status}>
      <AlertStatusIcon status={status} />
      <AlertContent>
        <AlertTitle>{title}</AlertTitle>
        {children !== undefined && <AlertDescription data-cy={dataCy}>{children}</AlertDescription>}
      </AlertContent>
    </Alert>
  );
}
