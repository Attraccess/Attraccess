import { CardDescription, Heading, Spinner } from '@heroui/react';

interface Props {
  statusText: string;
}

export function RegisterStep({ statusText }: Props) {
  return (
    <>
      <div>
        <Heading>Registering…</Heading>
        <CardDescription>
          Opening a connection and registering this device. Please wait.
        </CardDescription>
      </div>
      <div className="flex items-center gap-2 text-fg-muted text-sm">
        <Spinner />
        <span>{statusText || 'Connecting to server…'}</span>
      </div>
    </>
  );
}
