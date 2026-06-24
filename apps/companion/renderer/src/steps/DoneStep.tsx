interface Props {
  deviceId: number | null;
}

export function DoneStep({ deviceId }: Props) {
  return (
    <>
      <div>
        <h1 className="text-xl font-bold text-success">Setup complete!</h1>
        <p className="text-fg-muted text-sm mt-1">
          This device has been registered. Name it in the Attraccess admin panel.
        </p>
      </div>
      {deviceId !== null && (
        <p className="text-success text-sm text-center">Device ID: {deviceId}</p>
      )}
    </>
  );
}
