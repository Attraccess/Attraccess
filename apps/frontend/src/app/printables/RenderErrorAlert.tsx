import { Alert, AlertContent, AlertDescription, AlertTitle } from '@heroui/react';
import { AlertStatusIcon } from '@attraccess/plugins-frontend-ui';

interface RenderErrorAlertProps {
  title: string;
  message: string;
}

/** Why a model could not be generated. */
export function RenderErrorAlert({ title, message }: RenderErrorAlertProps) {
  return (
    // `role="alert"` makes HeroUI's otherwise-presentational Alert an assertive live
    // region, so screen readers announce it as soon as it mounts.
    <Alert status="danger" role="alert" data-cy="printables-error">
      <AlertStatusIcon status="danger" />
      <AlertContent>
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </AlertContent>
    </Alert>
  );
}
