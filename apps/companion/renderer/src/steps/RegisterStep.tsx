import { QRCode } from 'react-qrcode-logo';
import { Heading, Spinner } from '@heroui/react';

interface Props {
  statusText: string;
  code?: string | null;
}

export function RegisterStep({ statusText, code }: Props) {
  return (
    <>
      <div>
        <Heading>Approve this companion</Heading>
        <p className="text-sm leading-5 text-muted">
          An administrator must enter or scan this code in Attraccess → Devices → Companion App. The code changes every
          30 seconds.
        </p>
      </div>
      {code && (
        <div className="flex flex-col items-center gap-3">
          <Heading aria-label="Enrollment code">{code}</Heading>
          <QRCode value={`attraccess-enroll:v1:companion:${code}`} size={180} />
        </div>
      )}
      <div className="flex items-center gap-2 text-fg-muted text-sm">
        <Spinner />
        <span>{statusText || 'Connecting to server…'}</span>
      </div>
    </>
  );
}
