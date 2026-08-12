import { Button, Chip, Heading, Separator } from '@heroui/react';
import type { Permissions } from '../types';

interface Props {
  perms: Permissions | null;
  onGrant: () => void;
}

export function PermissionsStep({ perms, onGrant }: Props) {
  return (
    <>
      <div>
        <Heading>Permissions required</Heading>
        <p className="text-sm text-default-500">Grant the following permissions before connecting to your server.</p>
      </div>
      <div className="flex items-center justify-between gap-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Accessibility</p>
          <p className="text-fg-muted text-xs mt-0.5">Blocks keyboard and mouse input when a session is locked.</p>
        </div>
        {perms?.accessibility ? (
          <Chip color="success" variant="soft" size="sm" className="shrink-0">
            Granted
          </Chip>
        ) : (
          <Button size="sm" variant="primary" onPress={onGrant} className="shrink-0">
            Grant
          </Button>
        )}
      </div>
      <Separator />
      {!perms?.accessibility && (
        <p className="text-fg-muted text-xs">After granting in System Settings, this page updates automatically.</p>
      )}
    </>
  );
}
