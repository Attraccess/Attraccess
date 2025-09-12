import { useState, useCallback } from 'react';
import { Button, ButtonGroup, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@heroui/react';
import { PlayIcon, ChevronDownIcon, LockIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../../components/toastProvider';
import { SessionNotesModal, SessionModalMode } from '../SessionNotesModal';
import {
  useResourcesServiceResourceUsageStartSession,
  UseResourcesServiceResourceUsageGetActiveSessionKeyFn,
  UseResourcesServiceResourceUsageGetHistoryKeyFn,
  useResourcesServiceUnlockDoor,
  useResourcesServiceGetOneResourceById,
  StartUsageSessionDto,
  useResourcesServiceUnlatchDoor,
  useResourcesServiceLockDoor,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import en from './translations/en.json';
import de from './translations/de.json';

interface StartSessionControlsProps {
  resourceId: number;
}

export function StartSessionControls(
  props: Readonly<StartSessionControlsProps> & React.HTMLAttributes<HTMLDivElement>,
) {
  const { resourceId, ...divProps } = props;

  const { data: resource } = useResourcesServiceGetOneResourceById({ id: resourceId });

  const { t } = useTranslations({ en, de });
  const { success, error: showError } = useToastMessage();
  const queryClient = useQueryClient();

  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);

  const onStartSuccess = useCallback(() => {
    setIsNotesModalOpen(false);

    // Invalidate the active session query to refetch data
    queryClient.invalidateQueries({
      queryKey: UseResourcesServiceResourceUsageGetActiveSessionKeyFn({ resourceId }),
    });
    // Invalidate all history queries for this resource (regardless of pagination/user filters)
    queryClient.invalidateQueries({
      predicate: (query) => {
        const baseHistoryKey = UseResourcesServiceResourceUsageGetHistoryKeyFn({ resourceId });
        return (
          query.queryKey[0] === baseHistoryKey[0] &&
          query.queryKey.length > 1 &&
          JSON.stringify(query.queryKey[1]).includes(`"resourceId":${resourceId}`)
        );
      },
    });

    switch (resource?.type) {
      case 'machine':
        success({
          title: t('machine.sessionStarted'),
          description: t('machine.sessionStartedDescription'),
        });
        break;

      case 'door':
        success({
          title: t('door.success.title'),
          description: t('door.success.description'),
        });
        break;
    }
  }, [resourceId, t, queryClient, success, resource?.type]);

  const onStartError = useCallback(
    (err: unknown) => {
      let errorMessage = err;
      if (err instanceof Error) {
        errorMessage = err.message;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((err as any).body?.error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        errorMessage = (err as any).body.error;
      }

      switch (resource?.type) {
        case 'machine':
          showError({
            title: t('machine.sessionStartError'),
            description: t('machine.sessionStartErrorDescription') + ' ' + errorMessage,
          });
          break;

        case 'door':
          showError({
            title: t('door.error.title'),
            description: t('door.error.description') + ' ' + errorMessage,
          });
          break;
      }

      console.error('Failed to start session:', JSON.stringify(err));
    },
    [t, showError, resource?.type],
  );

  const { mutate: startSession, isPending: startIsPending } = useResourcesServiceResourceUsageStartSession({
    onSuccess: () => {
      onStartSuccess();
    },
    onError: (err) => {
      onStartError(err);
    },
  });

  const { mutate: unlockDoor, isPending: unlockDoorIsPending } = useResourcesServiceUnlockDoor({
    onSuccess: () => {
      onStartSuccess();
    },
    onError: (err) => {
      onStartError(err);
    },
  });

  const { mutate: lockDoor, isPending: lockDoorIsPending } = useResourcesServiceLockDoor({
    onSuccess: () => {
      onStartSuccess();
    },
    onError: (err) => {
      onStartError(err);
    },
  });

  const { mutate: unlatchDoor, isPending: unlatchDoorIsPending } = useResourcesServiceUnlatchDoor({
    onSuccess: () => {
      onStartSuccess();
    },
    onError: (err) => {
      onStartError(err);
    },
  });

  const handleStartSession = async (opts?: StartUsageSessionDto) => {
    startSession({
      resourceId,
      requestBody: opts ?? {},
    });
  };

  const handleOpenStartSessionModal = () => {
    setIsNotesModalOpen(true);
  };

  return (
    <div {...divProps}>
      <div className="space-y-4">
        {resource?.type === 'door' && (
          <div className="flex flex-row flex-wrap gap-2 w-full justify-between">
            <Button
              className="flex-1"
              isLoading={lockDoorIsPending}
              startContent={<LockIcon className="w-4 h-4" />}
              onPress={() => lockDoor({ resourceId })}
              color="danger"
            >
              {t('door.lock')}
            </Button>
            <Button
              className="flex-1"
              isLoading={unlockDoorIsPending}
              startContent={<LockIcon className="w-4 h-4" />}
              onPress={() => unlockDoor({ resourceId })}
              color="primary"
            >
              {t('door.unlock')}
            </Button>
            {resource.separateUnlockAndUnlatch && (
              <Button
                className="flex-1"
                isLoading={unlatchDoorIsPending}
                startContent={<LockIcon className="w-4 h-4" />}
                onPress={() => unlatchDoor({ resourceId })}
                color="secondary"
              >
                {t('door.unlatch')}
              </Button>
            )}
          </div>
        )}
        {resource?.type === 'machine' && (
          <>
            <p className="text-gray-500 dark:text-gray-400">{t('machine.noActiveSession')}</p>
            <ButtonGroup fullWidth color="primary">
              <Button
                isLoading={startIsPending}
                startContent={<PlayIcon className="w-4 h-4" />}
                onPress={() => handleStartSession()}
              >
                {t('machine.startSession')}
              </Button>
              <Dropdown placement="bottom-end">
                <DropdownTrigger>
                  <Button isIconOnly>
                    <ChevronDownIcon />
                  </Button>
                </DropdownTrigger>
                <DropdownMenu disallowEmptySelection aria-label={t('machine.alternativeStartSessionOptionsMenu.label')}>
                  <DropdownItem
                    key="startWithNotes"
                    description={t('machine.alternativeStartSessionOptionsMenu.startWithNotes.description')}
                    onPress={handleOpenStartSessionModal}
                  >
                    {t('machine.alternativeStartSessionOptionsMenu.startWithNotes.label')}
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </ButtonGroup>
          </>
        )}
      </div>

      <SessionNotesModal
        isOpen={isNotesModalOpen}
        onClose={() => setIsNotesModalOpen(false)}
        onConfirm={(notes) => handleStartSession({ notes, forceTakeOver: false })}
        mode={SessionModalMode.START}
        isSubmitting={startIsPending}
      />
    </div>
  );
}
