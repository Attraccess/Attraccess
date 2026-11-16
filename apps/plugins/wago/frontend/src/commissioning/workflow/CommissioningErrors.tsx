import { StatusAlert } from '@attraccess/plugins-frontend-ui';

export function CommissioningErrors({ errorMessages }: { errorMessages: string[] }) {
  return (
    <>
      {errorMessages.map((message, index) => (
        // The list is derived from a fixed set of mutations, so the position is stable.
        <StatusAlert key={index} status="danger">
          {message}
        </StatusAlert>
      ))}
    </>
  );
}
