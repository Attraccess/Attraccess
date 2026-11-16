import { Alert, AlertContent, AlertDescription } from '@heroui/react';
import { AlertStatusIcon } from '@attraccess/plugins-frontend-ui';

export function LoadFailedAlert({ message }: { message: string }) {
  return (
    <Alert status="danger">
      <AlertStatusIcon status="danger" />
      <AlertContent>
        <AlertDescription>{message}</AlertDescription>
      </AlertContent>
    </Alert>
  );
}
