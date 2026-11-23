import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './translations/en.json';
import de from './translations/de.json';
import { DoorOpenIcon, LockIcon } from 'lucide-react';
import { NetworkRestrictedAction } from '@attraccess/application-models';
import { useNetworkRestriction } from '../../../../../hooks/useNetworkRestriction';
import { NetworkRestrictedHint } from '../../../../../components/networkRestriction/NetworkRestrictedHint';

interface DoorControlsProps {
  onLock: () => void;
  onUnlock: () => void;
  onUnlatch?: () => void;
  onOpen: () => void;
  lockIsPending: boolean;
  unlockIsPending: boolean;
  unlatchIsPending: boolean;
  openIsPending: boolean;
  separateUnlockAndUnlatch?: boolean;
  /** An access-only door has a single action, Open. */
  accessOnly?: boolean;
}

export function DoorControls({
  onLock,
  onUnlock,
  onUnlatch,
  onOpen,
  lockIsPending,
  unlockIsPending,
  unlatchIsPending,
  openIsPending,
  separateUnlockAndUnlatch,
  accessOnly,
}: Readonly<DoorControlsProps>) {
  const { t } = useTranslations({ en, de });
  const { isRestricted } = useNetworkRestriction();
  if (accessOnly) {
    return (
      <div className="space-y-2">
        <div className="flex w-full">
          <Button
            variant="primary"
            className="flex-1"
            isPending={openIsPending}
            isDisabled={isRestricted(NetworkRestrictedAction.DoorOpen)}
            onPress={onOpen}
          >
            <DoorOpenIcon className="w-4 h-4" />
            {t('door.open')}
          </Button>
        </div>
        <NetworkRestrictedHint actions={NetworkRestrictedAction.DoorOpen} />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-row flex-wrap gap-2 w-full justify-between">
        <Button
          variant="danger"
          className="flex-1"
          isPending={lockIsPending}
          isDisabled={isRestricted(NetworkRestrictedAction.DoorLock)}
          onPress={onLock}
        >
          <LockIcon className="w-4 h-4" />
          {t('door.lock')}
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          isPending={unlockIsPending}
          isDisabled={isRestricted(NetworkRestrictedAction.DoorUnlock)}
          onPress={onUnlock}
        >
          <LockIcon className="w-4 h-4" />
          {t('door.unlock')}
        </Button>
        {separateUnlockAndUnlatch && onUnlatch && (
          <Button
            variant="secondary"
            className="flex-1"
            isPending={unlatchIsPending}
            isDisabled={isRestricted(NetworkRestrictedAction.DoorUnlatch)}
            onPress={onUnlatch}
          >
            <LockIcon className="w-4 h-4" />
            {t('door.unlatch')}
          </Button>
        )}
      </div>
      <NetworkRestrictedHint
        actions={[
          NetworkRestrictedAction.DoorLock,
          NetworkRestrictedAction.DoorUnlock,
          NetworkRestrictedAction.DoorUnlatch,
        ]}
      />
    </div>
  );
}
