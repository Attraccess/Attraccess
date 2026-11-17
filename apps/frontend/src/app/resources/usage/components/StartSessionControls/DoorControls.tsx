import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './translations/en.json';
import de from './translations/de.json';
import { LockIcon } from 'lucide-react';

interface DoorControlsProps {
  onLock: () => void;
  onUnlock: () => void;
  onUnlatch?: () => void;
  lockIsPending: boolean;
  unlockIsPending: boolean;
  unlatchIsPending: boolean;
  separateUnlockAndUnlatch?: boolean;
}

export function DoorControls({
  onLock,
  onUnlock,
  onUnlatch,
  lockIsPending,
  unlockIsPending,
  unlatchIsPending,
  separateUnlockAndUnlatch,
}: Readonly<DoorControlsProps>) {
  const { t } = useTranslations({ en, de });
  return (
    <div className="flex flex-row flex-wrap gap-2 w-full justify-between">
      <Button variant="danger" className="flex-1" isPending={lockIsPending} onPress={onLock}>
        <LockIcon className="w-4 h-4" />
        {t('door.lock')}
      </Button>
      <Button variant="primary" className="flex-1" isPending={unlockIsPending} onPress={onUnlock}>
        <LockIcon className="w-4 h-4" />
        {t('door.unlock')}
      </Button>
      {separateUnlockAndUnlatch && onUnlatch && (
        <Button variant="secondary" className="flex-1" isPending={unlatchIsPending} onPress={onUnlatch}>
          <LockIcon className="w-4 h-4" />
          {t('door.unlatch')}
        </Button>
      )}
    </div>
  );
}
