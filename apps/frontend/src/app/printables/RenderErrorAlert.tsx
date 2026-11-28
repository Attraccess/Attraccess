import { StatusAlert } from '@attraccess/plugins-frontend-ui';

interface RenderErrorAlertProps {
  title: string;
  message: string;
}

/** Why a model could not be generated. */
export function RenderErrorAlert({ title, message }: RenderErrorAlertProps) {
  return (
    // `role="alert"` makes the alert an assertive live region, so screen readers announce it as
    // soon as it mounts; the shared StatusAlert is otherwise presentational.
    <div role="alert" data-cy="printables-error">
      <StatusAlert status="danger" title={title}>
        {message}
      </StatusAlert>
    </div>
  );
}
