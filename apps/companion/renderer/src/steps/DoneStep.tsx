import { Heading } from '@heroui/react';

interface Props {
  deviceId: number | null;
}

export function DoneStep({ deviceId }: Props) {
  return (
    <>
      <div>
        <Heading className="text-success">Setup complete!</Heading>
        <p className="text-sm text-default-500">
          This device has been registered. Name it in the Attraccess admin panel.
        </p>
      </div>
      {deviceId !== null && <p className="text-success text-sm text-center">Device ID: {deviceId}</p>}
    </>
  );
}
