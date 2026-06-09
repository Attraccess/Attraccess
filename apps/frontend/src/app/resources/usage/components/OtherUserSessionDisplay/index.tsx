import { useState, useCallback, useMemo } from 'react';
import { ButtonGroup, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownPopover } from '@heroui/react';
import { SessionStatusCard } from '../SessionStatusCard';
import { Button } from '../../../../../components/button';
import { buttonVariants } from '@heroui/styles';
import { UserX, ChevronDownIcon, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { AttraccessUser, DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import {
  useResourcesServiceResourceUsageStartSession,
  UseResourcesServiceResourceUsageGetActiveSessionKeyFn,
  UseResourcesServiceResourceUsageGetHistoryKeyFn,
  useResourcesServiceResourceUsageGetActiveSession,
  useResourcesServiceResourceUsageCanControl,
  useResourcesServiceGetOneResourceById,
  useAccessControlServiceResourceIntroducersIsIntroducer,
  useResourcesServiceResourceUsageEndSession,
  useMessagingServiceMessagingContactResourceHolder,
  FormSubmissionRequestDto,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../../../hooks/useAuth';
import { useToastMessage } from '../../../../../components/toastProvider';
import { SessionNotesModal, SessionModalMode } from '../SessionNotesModal';
import en from './translations/en.json';
import de from './translations/de.json';
import { useResourceFormsSubmission } from '../../../forms/hooks/useResourceFormsSubmission';

interface OtherUserSessionDisplayProps {
  resourceId: number;
}

export function OtherUserSessionDisplay({ resourceId }: OtherUserSessionDisplayProps) {
  const { t } = useTranslations({ en, de });
  const { hasPermission, user } = useAuth();
  const { success, error: showError } = useToastMessage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isTakeoverNotesModalOpen, setIsTakeoverNotesModalOpen] = useState(false);
  const [isStopOtherUserSessionNotesModalOpen, setIsStopOtherUserSessionNotesModalOpen] = useState(false);
  const { requestForms, modal: formsModal } = useResourceFormsSubmission(resourceId);

  const { data: activeSessionResponse } = useResourcesServiceResourceUsageGetActiveSession({ resourceId });
  const activeSession = useMemo(() => activeSessionResponse?.usage, [activeSessionResponse]);

  const { data: access } = useResourcesServiceResourceUsageCanControl({ resourceId });

  const { data: permissions } = useAccessControlServiceResourceIntroducersIsIntroducer(
    { resourceId, userId: user?.id as number, includeGroups: true },
    undefined,
    {
      enabled: !!user?.id,
    },
  );

  const { data: resource } = useResourcesServiceGetOneResourceById({ id: resourceId });

  const canManageResources = hasPermission('canManageResources');
  const canStartSession = canManageResources || access?.canControl || permissions?.isIntroducer;
  const canTakeover = resource?.allowTakeOver && canStartSession;
  const canStopOtherUserSession = permissions?.isIntroducer || canManageResources;

  const startSession = useResourcesServiceResourceUsageStartSession({
    onSuccess: () => {
      setIsTakeoverNotesModalOpen(false);

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
        title: t('takeover.successful'),
        description: t('takeover.successfulDescription'),
      });
    },
    onError: (err) => {
      showError({
        title: t('takeover.error'),
        description: t('takeover.errorDescription'),
      });
      console.error('Failed to takeover session:', err);
    },
  });

  const stopSession = useResourcesServiceResourceUsageEndSession({
    onSuccess: () => {
      setIsTakeoverNotesModalOpen(false);

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
        title: t('stopOtherUserSession.successful'),
        description: t('stopOtherUserSession.successfulDescription'),
      });
    },
  });

  const contactHolder = useMessagingServiceMessagingContactResourceHolder({
    onSuccess: ({ conversationId }) => {
      navigate(`/messages?conversation=${conversationId}&resourceRef=${resourceId}`);
    },
    onError: () => {
      showError({ title: t('contact.error'), description: t('contact.errorDescription') });
    },
  });

  const handleContactHolder = useCallback(() => {
    contactHolder.mutate({ resourceId });
  }, [contactHolder, resourceId]);

  const runTakeover = useCallback(
    async (body: { notes?: string }) => {
      let formSubmissions: FormSubmissionRequestDto[] = [];
      try {
        formSubmissions = await requestForms('takeover');
      } catch (error) {
        if ((error as Error).message === 'user_cancelled_forms') {
          return;
        }
        throw error;
      }

      startSession.mutate({
        resourceId,
        requestBody: { ...body, forceTakeOver: true, formSubmissions },
      });
    },
    [requestForms, resourceId, startSession],
  );

  const runStopOtherSession = useCallback(
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

      stopSession.mutate({
        resourceId,
        requestBody: { ...body, formSubmissions },
      });
    },
    [requestForms, resourceId, stopSession],
  );

  const handleStopOtherUserSessionWithNotes = async (notes: string) => {
    await runStopOtherSession({ notes });
  };

  const handleTakeoverWithNotes = async (notes: string) => {
    await runTakeover({ notes });
  };

  const handleImmediateTakeover = useCallback(() => {
    void runTakeover({});
  }, [runTakeover]);

  const handleOpenTakeoverModal = () => {
    setIsTakeoverNotesModalOpen(true);
  };

  const handleOpenStopOtherUserSessionModal = () => {
    setIsStopOtherUserSessionNotesModalOpen(true);
  };

  const handleImmediateStopOtherUserSession = useCallback(() => {
    void runStopOtherSession({});
  }, [runStopOtherSession]);

  // Early return if no active session or it belongs to current user
  if (!activeSession || activeSession.userId === user?.id) {
    return null;
  }

  return (
    <>
      <SessionStatusCard
        accent="warning"
        statusLabel={t('inUse')}
        centerStatus
        bodyClassName="text-center"
        data-cy="other-user-session-card"
        chipDataCy="other-user-in-use-chip"
      >
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('resourceInUseBy')}</p>
        <div className="flex justify-center">
          {activeSession.user ? (
            <AttraccessUser user={activeSession.user} />
          ) : (
            <p className="text-sm font-medium text-gray-900 dark:text-white">{t('unknownUser')}</p>
          )}
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500">
          ({t('sessionStarted')} <DateTimeDisplay date={activeSession.startTime} />)
        </p>

        {activeSession.supervisorUser && (
          <div className="space-y-1 flex flex-col items-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('supervisedBy')}:</p>
            <AttraccessUser user={activeSession.supervisorUser} />
          </div>
        )}

        <div>
          <Button
            variant="ghost"
            size="sm"
            isPending={contactHolder.isPending}
            onPress={handleContactHolder}
            data-cy="contact-current-user-button"
          ><MessageCircle className="w-3.5 h-3.5" />
            {t('contact.button')}
          </Button>
        </div>

        {canTakeover && (
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{t('takeover.available')}</p>
            <ButtonGroup className="w-full">
              <Button
                variant="danger-soft"
                isPending={startSession.isPending}
                onPress={handleImmediateTakeover}
              ><UserX className="w-4 h-4" />
                {t('takeover.button')}
              </Button>
              <Dropdown>
                <DropdownTrigger className={buttonVariants({ isIconOnly: true, variant: 'danger-soft' })}>
                  <ChevronDownIcon />
                </DropdownTrigger>
                <DropdownPopover>
                  <DropdownMenu aria-label={t('takeover.optionsMenu.label')}>
                    <DropdownItem
                      key="takeoverWithNotes" id="takeoverWithNotes"
                      onPress={handleOpenTakeoverModal}
                    >
                      {t('takeover.optionsMenu.takeoverWithNotes.label')}
                    </DropdownItem>
                  </DropdownMenu>
                </DropdownPopover>
              </Dropdown>
            </ButtonGroup>
          </div>
        )}

        {canStopOtherUserSession && (
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{t('stopOtherUserSession.available')}</p>
            <ButtonGroup className="w-full">
              <Button
                variant="danger"
                isPending={startSession.isPending}
                onPress={handleImmediateStopOtherUserSession}
              ><UserX className="w-4 h-4" />
                {t('stopOtherUserSession.button')}
              </Button>
              <Dropdown>
                <DropdownTrigger className={buttonVariants({ isIconOnly: true, variant: 'danger' })}>
                  <ChevronDownIcon />
                </DropdownTrigger>
                <DropdownPopover>
                  <DropdownMenu aria-label={t('stopOtherUserSession.optionsMenu.label')}>
                    <DropdownItem
                      key="stopOtherUserSessionWithNotes" id="stopOtherUserSessionWithNotes"
                      onPress={handleOpenStopOtherUserSessionModal}
                    >
                      {t('stopOtherUserSession.optionsMenu.stopOtherUserSessionWithNotes.label')}
                    </DropdownItem>
                  </DropdownMenu>
                </DropdownPopover>
              </Dropdown>
            </ButtonGroup>
          </div>
        )}
      </SessionStatusCard>

      <SessionNotesModal
        isOpen={isTakeoverNotesModalOpen}
        onClose={() => setIsTakeoverNotesModalOpen(false)}
        onConfirm={(notes) => void handleTakeoverWithNotes(notes)}
        mode={SessionModalMode.START}
        isSubmitting={startSession.isPending}
      />

      <SessionNotesModal
        isOpen={isStopOtherUserSessionNotesModalOpen}
        onClose={() => setIsStopOtherUserSessionNotesModalOpen(false)}
        onConfirm={(notes) => void handleStopOtherUserSessionWithNotes(notes)}
        mode={SessionModalMode.END}
        isSubmitting={stopSession.isPending}
      />
      {formsModal}
    </>
  );
}
