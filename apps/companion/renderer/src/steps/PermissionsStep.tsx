import { Button } from '@heroui/react';
import type { Permissions } from '../types';

interface Props {
  perms: Permissions | null;
  onGrant: () => void;
}

export function PermissionsStep({ perms, onGrant }: Props) {
  return (
    <>
      <div>
        <h1 className="text-xl font-bold">Permissions required</h1>
        <p className="text-fg-muted text-sm mt-1">
          Grant the following permissions before connecting to your server.
        </p>
      </div>
      <div className="flex items-center justify-between gap-4 py-3 border-b border-divider">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Accessibility</p>
          <p className="text-fg-muted text-xs mt-0.5">
            Blocks keyboard and mouse input when a session is locked.
          </p>
        </div>
        {perms?.accessibility ? (
          <span className="text-success text-sm font-medium shrink-0">Granted</span>
        ) : (
          <Button size="sm" variant="primary" onPress={onGrant} className="shrink-0">
            Grant
          </Button>
        )}
      </div>
      {!perms?.accessibility && (
        <p className="text-fg-muted text-xs">
          After granting in System Settings, this page updates automatically.
        </p>
      )}
    </>
  );
}
