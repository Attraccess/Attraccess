import { TFunction } from '@attraccess/plugins-frontend-ui';
import { Button, Spinner } from '@heroui/react';
import { LockIcon } from 'lucide-react';

interface DoorControlsProps {
  t: TFunction;
  onLock: () => void;
  onUnlock: () => void;
  onUnlatch?: () => void;
  lockIsPending: boolean;
  unlockIsPending: boolean;
  unlatchIsPending: boolean;
  separateUnlockAndUnlatch?: boolean;
}

export function DoorControls({
  t,
  onLock,
  onUnlock,
  onUnlatch,
  lockIsPending,
  unlockIsPending,
  unlatchIsPending,
  separateUnlockAndUnlatch,
}: DoorControlsProps) {
  return (
    <div className="flex flex-row flex-wrap gap-2 w-full justify-between">
      <Button variant="danger" className="flex-1" isPending={lockIsPending} onPress={onLock}>
        {({ isPending }) =>
          isPending ? (
            <Spinner color="current" />
          ) : (
            <>
              <LockIcon className="w-4 h-4" />
              {t('door.lock')}
            </>
          )
        }
      </Button>
      <Button variant="primary" className="flex-1" isPending={unlockIsPending} onPress={onUnlock}>
        {({ isPending }) =>
          isPending ? (
            <Spinner color="current" />
          ) : (
            <>
              <LockIcon className="w-4 h-4" />
              {t('door.unlock')}
            </>
          )
        }
      </Button>
      {separateUnlockAndUnlatch && onUnlatch && (
        <Button variant="secondary" className="flex-1" isPending={unlatchIsPending} onPress={onUnlatch}>
          {({ isPending }) =>
            isPending ? (
              <Spinner size="sm" />
            ) : (
              <>
                <LockIcon className="w-4 h-4" />
                {t('door.unlatch')}
              </>
            )
          }
        </Button>
      )}
    </div>
  );
}
