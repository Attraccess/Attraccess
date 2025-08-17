import { useState, useCallback } from 'react';
import { Button, ButtonGroup, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@heroui/react';
import { StopCircle, ChevronDownIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../../components/toastProvider';
import { SessionTimer } from '../SessionTimer';
import { SessionNotesModal, SessionModalMode } from '../SessionNotesModal';
import {
  useResourcesServiceResourceUsageEndSession,
  UseResourcesServiceResourceUsageGetActiveSessionKeyFn,
  UseResourcesServiceResourceUsageGetHistoryKeyFn,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import * as en from './translations/en.json';
import * as de from './translations/de.json';
import { FlowButtons } from './flowButtons';

interface ActiveSessionDisplayProps {
  resourceId: number;
  startTime: string;
}

export function ActiveSessionDisplay({ resourceId, startTime }: ActiveSessionDisplayProps) {
  const { t } = useTranslations('activeSessionDisplay', { en, de });
  const { success, error: showError } = useToastMessage();
  const queryClient = useQueryClient();
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);

  const endSession = useResourcesServiceResourceUsageEndSession({
    onSuccess: () => {
      setIsNotesModalOpen(false);

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
      // Reset active session query instead of just invalidating
      queryClient.resetQueries({
        queryKey: UseResourcesServiceResourceUsageGetActiveSessionKeyFn({ resourceId }),
      });
      success({
        title: t('sessionEnded'),
        description: t('sessionEndedDescription'),
      });
    },
    onError: (err) => {
      console.error('Error ending session:', err);
      showError({
        title: t('sessionEndError'),
        description: t('sessionEndErrorDescription'),
      });
    },
  });

  const immediatelyEndSession = useCallback(() => {
    endSession.mutate({
      resourceId,
      requestBody: {},
    });
  }, [endSession, resourceId]);

  const handleEndSession = async (notes: string) => {
    endSession.mutate({
      resourceId,
      requestBody: { notes },
    });
  };

  const handleOpenEndSessionModal = () => {
    setIsNotesModalOpen(true);
  };

  return (
    <>
      <div className="space-y-4">
        <SessionTimer startTime={startTime} />

        <FlowButtons resourceId={resourceId} />

        <ButtonGroup fullWidth color="danger">
          <Button
            isLoading={endSession.isPending}
            startContent={<StopCircle className="w-4 h-4" />}
            onPress={immediatelyEndSession}
          >
            {t('endSession')}
          </Button>
          <Dropdown placement="bottom-end">
            <DropdownTrigger>
              <Button isIconOnly>
                <ChevronDownIcon />
              </Button>
            </DropdownTrigger>
            <DropdownMenu disallowEmptySelection aria-label={t('alternativeEndSessionOptionsMenu.label')}>
              <DropdownItem
                key="endWithNotes"
                description={t('alternativeEndSessionOptionsMenu.endWithNotes.description')}
                onPress={handleOpenEndSessionModal}
              >
                {t('alternativeEndSessionOptionsMenu.endWithNotes.label')}
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </ButtonGroup>
      </div>

      <SessionNotesModal
        isOpen={isNotesModalOpen}
        onClose={() => setIsNotesModalOpen(false)}
        onConfirm={handleEndSession}
        mode={SessionModalMode.END}
        isSubmitting={endSession.isPending}
      />
    </>
  );
}
