import { useState, useCallback } from 'react';
import {
  ButtonGroup,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownPopover,
} from '@heroui/react';
import { Button } from '../../../../../components/button';
import { buttonVariants } from '@heroui/styles';
import { StopCircle, ChevronDownIcon } from 'lucide-react';
import { useTranslations, AttraccessUser } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../../components/toastProvider';
import { SessionTimer } from '../SessionTimer';
import { SessionNotesModal, SessionModalMode } from '../SessionNotesModal';
import {
  ApiError,
  FormSubmissionRequestDto,
  useResourcesServiceResourceUsageEndSession,
  useResourcesServiceResourceUsageGetActiveSession,
  UseResourcesServiceResourceUsageGetActiveSessionKeyFn,
  UseResourcesServiceResourceUsageGetHistoryKeyFn,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import en from './translations/en.json';
import de from './translations/de.json';
import { FlowButtons } from './flowButtons';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import { useResourceFormsSubmission } from '../../../forms/hooks/useResourceFormsSubmission';

interface ActiveSessionDisplayProps {
  resourceId: number;
  startTime: string;
}

export function ActiveSessionDisplay({ resourceId, startTime }: ActiveSessionDisplayProps) {
  const { t, tExists } = useTranslations({
    en: {
      ...en,
      api: API_ERROR_TRANSLATIONS_EN,
    },
    de: {
      ...de,
      api: API_ERROR_TRANSLATIONS_DE,
    },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);

  const { requestForms, modal: formsModal } = useResourceFormsSubmission(resourceId);

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
      toast.success({
        title: t('sessionEnded.success.title'),
        description: t('sessionEnded.success.description'),
      });
    },
    onError: (err) => {
      console.error('Error ending session:', err);
      toast.apiError({
        baseTranslationKey: 'api',
        t,
        tExists,
        error: err as ApiError,
      });
    },
  });

  const runEndSession = useCallback(
    async (body: { notes?: string }) => {
      let formSubmissions: FormSubmissionRequestDto[] = [];
      try {
        formSubmissions = await requestForms('end');
      } catch (error) {
        if ((error as Error).message === 'user_cancelled_forms') {
          return;
        }
        throw error;
      }

      endSession.mutate({
        resourceId,
        requestBody: { ...body, formSubmissions },
      });
    },
    [endSession, requestForms, resourceId],
  );

  const immediatelyEndSession = useCallback(() => {
    void runEndSession({});
  }, [runEndSession]);

  const handleEndSession = async (notes: string) => {
    await runEndSession({ notes });
  };

  const handleOpenEndSessionModal = () => {
    setIsNotesModalOpen(true);
  };

  const { data: activeSession } = useResourcesServiceResourceUsageGetActiveSession({ resourceId });

  return (
    <>
      <div className="space-y-4">
        {activeSession?.usage?.project && (
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('project')}:</p>
            <p className="font-medium text-gray-900 dark:text-white whitespace-nowrap">
              {activeSession.usage.project.name}
            </p>
          </div>
        )}
        {activeSession?.usage?.supervisorUser && (
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('supervisedBy')}:</p>
            <AttraccessUser user={activeSession.usage.supervisorUser} />
          </div>
        )}
        <SessionTimer startTime={startTime} />

        <FlowButtons resourceId={resourceId} />

        <ButtonGroup className="w-full">
          <Button
            variant="danger"
            isPending={endSession.isPending}
            onPress={immediatelyEndSession}
          ><StopCircle className="w-4 h-4" />
            {t('endSession')}
          </Button>
          <Dropdown>
            <DropdownTrigger className={buttonVariants({ isIconOnly: true, variant: 'danger' })}>
              <ChevronDownIcon />
            </DropdownTrigger>
            <DropdownPopover>
              <DropdownMenu aria-label={t('alternativeEndSessionOptionsMenu.label')}>
                <DropdownItem
                  key="endWithNotes" id="endWithNotes"
                  onPress={handleOpenEndSessionModal}
                >
                  {t('alternativeEndSessionOptionsMenu.endWithNotes.label')}
                </DropdownItem>
              </DropdownMenu>
            </DropdownPopover>
          </Dropdown>
        </ButtonGroup>
      </div>

      <SessionNotesModal
        isOpen={isNotesModalOpen}
        onClose={() => setIsNotesModalOpen(false)}
        onConfirm={(notes) => void handleEndSession(notes)}
        mode={SessionModalMode.END}
        isSubmitting={endSession.isPending}
      />
      {formsModal}
    </>
  );
}
