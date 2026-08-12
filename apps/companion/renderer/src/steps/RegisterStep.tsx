import { Heading, Spinner } from '@heroui/react';

interface Props {
  statusText: string;
}

export function RegisterStep({ statusText }: Props) {
  return (
    <>
      <div>
        <Heading>Registering…</Heading>
        <p className="text-sm text-default-500">Opening a connection and registering this device. Please wait.</p>
      </div>
      <div className="flex items-center gap-2 text-fg-muted text-sm">
        <Spinner />
        <span>{statusText || 'Connecting to server…'}</span>
      </div>
    </>
  );
}
