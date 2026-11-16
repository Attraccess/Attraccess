import { Alert, AlertContent, AlertDescription, AlertTitle } from '@heroui/react';
import { AlertStatusIcon } from '@attraccess/plugins-frontend-ui';

export function Notice({
  title,
  description,
  status = 'danger',
}: {
  title: string;
  description?: string;
  status?: 'danger' | 'success';
}) {
  return (
    <Alert status={status}>
      <AlertStatusIcon status={status} />
      <AlertContent>
        <AlertTitle>{title}</AlertTitle>
        {description && <AlertDescription>{description}</AlertDescription>}
      </AlertContent>
    </Alert>
  );
}
