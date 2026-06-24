import { Spinner } from '@heroui/react';

interface Props {
  statusText: string;
}

export function RegisterStep({ statusText }: Props) {
  return (
    <>
      <div>
        <h1 className="text-xl font-bold">Registering…</h1>
        <p className="text-fg-muted text-sm mt-1">
          Opening a connection and registering this device. Please wait.
        </p>
      </div>
      <div className="flex items-center gap-2 text-fg-muted text-sm">
        <Spinner />
        <span>{statusText || 'Connecting to server…'}</span>
      </div>
    </>
  );
}
