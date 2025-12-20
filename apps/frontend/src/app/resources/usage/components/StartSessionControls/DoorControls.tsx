import { TFunction } from '@attraccess/plugins-frontend-ui';
import { Button } from '@heroui/react';
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
      <Button
        className="flex-1"
        isLoading={lockIsPending}
        startContent={<LockIcon className="w-4 h-4" />}
        onPress={onLock}
        color="danger"
      >
        {t('door.lock')}
      </Button>
      <Button
        className="flex-1"
        isLoading={unlockIsPending}
        startContent={<LockIcon className="w-4 h-4" />}
        onPress={onUnlock}
        color="primary"
      >
        {t('door.unlock')}
      </Button>
      {separateUnlockAndUnlatch && onUnlatch && (
        <Button
          className="flex-1"
          isLoading={unlatchIsPending}
          startContent={<LockIcon className="w-4 h-4" />}
          onPress={onUnlatch}
          color="secondary"
        >
          {t('door.unlatch')}
        </Button>
      )}
    </div>
  );
}
