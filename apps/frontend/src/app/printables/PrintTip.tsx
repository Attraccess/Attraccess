import { Alert, AlertContent, AlertDescription } from '@heroui/react';
import { AlertStatusIcon } from '@attraccess/plugins-frontend-ui';

/** How to print a model. */
export function PrintTip({ children }: { children: string }) {
  return (
    <Alert status="accent">
      <AlertStatusIcon status="accent" />
      <AlertContent>
        <AlertDescription>{children}</AlertDescription>
      </AlertContent>
    </Alert>
  );
}
