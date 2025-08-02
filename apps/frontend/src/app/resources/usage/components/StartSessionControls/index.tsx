import { useState, useCallback } from 'react';
import { Button, ButtonGroup, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@heroui/react';
import { PlayIcon, ChevronDownIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../../components/toastProvider';
import { SessionNotesModal, SessionModalMode } from '../SessionNotesModal';
import {
  useResourcesServiceResourceUsageStartSession,
  UseResourcesServiceResourceUsageGetActiveSessionKeyFn,
  UseResourcesServiceResourceUsageGetHistoryKeyFn,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import * as en from './translations/en.json';
import * as de from './translations/de.json';

interface StartSessionControlsProps {
  resourceId: number;
}

export function StartSessionControls(
  props: Readonly<StartSessionControlsProps> & React.HTMLAttributes<HTMLDivElement>
) {
  const { resourceId, ...divProps } = props;

  const { t } = useTranslations('startSessionControls', { en, de });
  const { success, error: showError } = useToastMessage();
  const queryClient = useQueryClient();

  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);

  const startSession = useResourcesServiceResourceUsageStartSession({
    onSuccess: () => {
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
      success({
        title: t('sessionStarted'),
        description: t('sessionStartedDescription'),
      });
    },
    onError: (err) => {
      let errorMessage = err;
      if (err instanceof Error) {
        errorMessage = err.message;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((err as any).body?.error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        errorMessage = (err as any).body.error;
      }

      showError({
        title: t('sessionStartError'),
        description: t('sessionStartErrorDescription') + ' ' + errorMessage,
      });
      console.error('Failed to start session:', JSON.stringify(err));
    },
  });

  const handleStartSession = async (notes: string) => {
    startSession.mutate({
      resourceId,
      requestBody: { notes, forceTakeOver: false },
    });
  };

  const immediatelyStartSession = useCallback(() => {
    startSession.mutate({
      resourceId,
      requestBody: {},
    });
  }, [startSession, resourceId]);

  const handleOpenStartSessionModal = () => {
    setIsNotesModalOpen(true);
  };

  return (
    <div {...divProps}>
      <div className="space-y-4">
        <p className="text-gray-500 dark:text-gray-400">{t('noActiveSession')}</p>

        <ButtonGroup fullWidth color="primary">
          <Button
            isLoading={startSession.isPending}
            startContent={<PlayIcon className="w-4 h-4" />}
            onPress={immediatelyStartSession}
          >
            {t('startSession')}
          </Button>
          <Dropdown placement="bottom-end">
            <DropdownTrigger>
              <Button isIconOnly>
                <ChevronDownIcon />
              </Button>
            </DropdownTrigger>
            <DropdownMenu disallowEmptySelection aria-label={t('alternativeStartSessionOptionsMenu.label')}>
              <DropdownItem
                key="startWithNotes"
                description={t('alternativeStartSessionOptionsMenu.startWithNotes.description')}
                onPress={handleOpenStartSessionModal}
              >
                {t('alternativeStartSessionOptionsMenu.startWithNotes.label')}
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </ButtonGroup>
      </div>

      <SessionNotesModal
        isOpen={isNotesModalOpen}
        onClose={() => setIsNotesModalOpen(false)}
        onConfirm={handleStartSession}
        mode={SessionModalMode.START}
        isSubmitting={startSession.isPending}
      />
    </div>
  );
}
