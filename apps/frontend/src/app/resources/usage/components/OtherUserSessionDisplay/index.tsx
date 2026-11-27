import { ButtonGroup, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownPopover } from '@heroui/react';
import { SessionStatusCard } from '../SessionStatusCard/index';
import { buttonVariants } from '@heroui/styles';
import { UserX, ChevronDownIcon, MessageCircle } from 'lucide-react';
import { AttraccessUser, Button, DateTimeDisplay, useTranslations } from '@attraccess/plugins-frontend-ui';
import { SessionNotesModal, SessionModalMode } from '../SessionNotesModal/index';
import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useResourceUsageGetActiveSession,
  useResourceUsageCanControl,
  useGetOneResourceById,
  useResourceIntroducersIsIntroducer,
  useResourceUsageEndSession,
  useMessagingContactResourceHolder,
  ApiError,
  FormSubmissionRequestDto,
  UseResourceUsageGetActiveSessionKeyFn,
  UseResourceUsageGetHistoryKeyFn,
} from '@attraccess/react-query-client';
import { NetworkRestrictedAction } from '@attraccess/application-models';
import { useNetworkRestriction } from '../../../../../hooks/useNetworkRestriction';
import { NetworkRestrictedHint } from '../../../../../components/networkRestriction/NetworkRestrictedHint';
import { useAuth } from '../../../../../hooks/useAuth';
import { useToastMessage } from '../../../../../components/toastProvider';
import { useRefreshNetworkRestrictionOnError } from '../../../../../hooks/useRefreshNetworkRestrictionOnError';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import en from './translations/en.json';
import de from './translations/de.json';
import { useResourceFormsSubmission } from '../../../forms/hooks/useResourceFormsSubmission';
import { SessionAutoEnd } from '../SessionAutoEnd';
import { useCanEndOtherSessions } from '../../hooks/useCanEndOtherSessions';
import { useQueryClient } from '@tanstack/react-query';
import { useStartSessionWithConfirmation } from '../../hooks/useStartSessionWithConfirmation';
import { useSessionDurationEstimate } from '../../hooks/useSessionDurationEstimate';
import { sessionStartOf } from '../../sessionDuration';

export function useInvalidateSessionHistory(resourceId: number) {
  const queryClient = useQueryClient();
  return () => {
    // Invalidate the active session query to refetch data
    queryClient.invalidateQueries({
      queryKey: UseResourceUsageGetActiveSessionKeyFn({ path: { resourceId } }),
    });
    // Invalidate all history queries for this resource (regardless of pagination/user filters)
    queryClient.invalidateQueries({
      predicate: (query) => {
        const baseHistoryKey = UseResourceUsageGetHistoryKeyFn({ path: { resourceId } });
        return (
          query.queryKey[0] === baseHistoryKey[0] &&
          query.queryKey.length > 1 &&
          JSON.stringify(query.queryKey[1]).includes(`"resourceId":${resourceId}`)
        );
      },
    });
  };
}

export interface OtherUserSessionDisplayProps {
  resourceId: number;
}

export function OtherUserSessionDisplay({ resourceId }: OtherUserSessionDisplayProps) {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const { hasPermission, user } = useAuth();
  const { isRestricted } = useNetworkRestriction();
  const takeoverRestricted = isRestricted(NetworkRestrictedAction.UsageTakeover);
  const endRestricted = isRestricted(NetworkRestrictedAction.UsageEnd);
  const { success, error: showError, apiError } = useToastMessage();
  const refreshNetworkRestriction = useRefreshNetworkRestrictionOnError();
  const invalidateSessionHistory = useInvalidateSessionHistory(resourceId);
  const navigate = useNavigate();
  const [isTakeoverNotesModalOpen, setIsTakeoverNotesModalOpen] = useState(false);
  const [isStopOtherUserSessionNotesModalOpen, setIsStopOtherUserSessionNotesModalOpen] = useState(false);
  const { requestForms, modal: formsModal, clearFormsDraft } = useResourceFormsSubmission(resourceId);

  const { data: activeSessionResponse } = useResourceUsageGetActiveSession({ path: { resourceId } });
  const activeSession = useMemo(() => activeSessionResponse?.usage, [activeSessionResponse]);

  const { data: access } = useResourceUsageCanControl({ path: { resourceId } });

  const { data: permissions } = useResourceIntroducersIsIntroducer(
    { path: { resourceId, userId: user?.id as number }, query: { includeGroups: true } },
    undefined,
    {
      enabled: !!user?.id,
    },
  );

  const { data: resource } = useGetOneResourceById({ path: { id: resourceId } });
  const { canEndSession } = useCanEndOtherSessions(resourceId);

  const canUpdateResources = hasPermission('resources.update');
  const canStartSession = canUpdateResources || access?.canControl || permissions?.isIntroducer;
  const canTakeover = resource?.allowTakeOver && canStartSession;
  const canStopOtherUserSession = canEndSession(activeSession);

  // A takeover is a start for the new user, so it gets the plugin confirmation and block handling too.
  const startSession = useStartSessionWithConfirmation(resourceId, {
    onSuccess: () => {
      clearFormsDraft();
      setIsTakeoverNotesModalOpen(false);

      invalidateSessionHistory();
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
    // The plugin confirmation or block notice replaces the notes modal.
    onPluginNotice: () => setIsTakeoverNotesModalOpen(false),
  });

  const { start: startTakeover } = startSession;
  const { ask: askDuration, dialog: durationDialog } = useSessionDurationEstimate(resourceId);

  const stopSession = useResourceUsageEndSession(undefined, {
    onSuccess: () => {
      clearFormsDraft();
      setIsStopOtherUserSessionNotesModalOpen(false);

      invalidateSessionHistory();

      success({
        title: t('stopOtherUserSession.successful'),
        description: t('stopOtherUserSession.successfulDescription'),
      });
    },
    onError: (err) => {
      // e.g. NETWORK_RESTRICTED when the user's network changed since the controls were drawn. The notes modal stays
      // open (the notes typed into it are cleared on confirm), and the refreshed status disables the control.
      refreshNetworkRestriction(err);
      apiError({ error: err as ApiError, t, tExists, baseTranslationKey: 'api' });
    },
  });

  const contactHolder = useMessagingContactResourceHolder(undefined, {
    onSuccess: ({ conversationId }) => {
      navigate(`/messages?conversation=${conversationId}&resourceRef=${resourceId}`);
    },
    onError: () => {
      showError({ title: t('contact.error'), description: t('contact.errorDescription') });
    },
  });

  const handleContactHolder = useCallback(() => {
    // Name the shown holder, so the message never goes to someone who started after the shown session ended.
    contactHolder.mutate({ path: { resourceId }, query: { userId: activeSession?.userId } });
  }, [activeSession?.userId, contactHolder, resourceId]);

  const runTakeover = useCallback(
    async (body: { notes?: string }) => {
      // The new holder states how long they will use the machine, as for a start.
      const estimate = await askDuration();
      if (estimate === null) return;
      let formSubmissions: FormSubmissionRequestDto[];
      try {
        formSubmissions = await requestForms('takeover');
      } catch (error) {
        if ((error as Error).message === 'user_cancelled_forms') {
          return;
        }
        throw error;
      }

      startTakeover({
        ...body,
        forceTakeOver: true,
        formSubmissions,
        ...(estimate === undefined ? {} : { estimatedDurationMinutes: estimate }),
      });
    },
    [askDuration, requestForms, startTakeover],
  );

  const runStopOtherSession = useCallback(
    async (body: { notes?: string }) => {
      // Target the shown session by id: if it ended meanwhile, the server refuses instead of stopping whoever
      // started next.
      const usageId = activeSession?.id;
      if (usageId === undefined) return;
      let formSubmissions: FormSubmissionRequestDto[];
      try {
        formSubmissions = await requestForms('end');
      } catch (error) {
        if ((error as Error).message === 'user_cancelled_forms') {
          return;
        }
        throw error;
      }

      stopSession.mutate({ path: { resourceId }, body: { ...body, usageId, formSubmissions } });
    },
    [activeSession?.id, requestForms, resourceId, stopSession],
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
          ({t('sessionStarted')} <DateTimeDisplay date={sessionStartOf(activeSession)} />)
        </p>

        {activeSession.autoEndAt && (
          <SessionAutoEnd
            resourceId={resourceId}
            usage={activeSession}
            canExtend={canEndSession(activeSession)}
            centered
          />
        )}

        {activeSession.supervisorUser && (
          <div className="space-y-1 flex flex-col items-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('supervisedBy')}:</p>
            <AttraccessUser user={activeSession.supervisorUser} />
          </div>
        )}

        {/* A redacted session has no user: the viewer may not know who holds the resource, so they cannot contact them. */}
        {activeSession.user && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              isPending={contactHolder.isPending}
              onPress={handleContactHolder}
              data-cy="contact-current-user-button"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {t('contact.button')}
            </Button>
          </div>
        )}

        {canTakeover && (
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{t('takeover.available')}</p>
            <ButtonGroup className="w-full">
              <Button
                variant="danger-soft"
                isPending={startSession.isPending}
                isDisabled={takeoverRestricted}
                onPress={handleImmediateTakeover}
              >
                <UserX className="w-4 h-4" />
                {t('takeover.button')}
              </Button>
              <Dropdown>
                <DropdownTrigger
                  isDisabled={takeoverRestricted}
                  className={`${buttonVariants({ isIconOnly: true, variant: 'danger-soft' })} inline-flex items-center justify-center`}
                >
                  <ChevronDownIcon />
                </DropdownTrigger>
                <DropdownPopover>
                  <DropdownMenu aria-label={t('takeover.optionsMenu.label')}>
                    <DropdownItem key="takeoverWithNotes" id="takeoverWithNotes" onPress={handleOpenTakeoverModal}>
                      {t('takeover.optionsMenu.takeoverWithNotes.label')}
                    </DropdownItem>
                  </DropdownMenu>
                </DropdownPopover>
              </Dropdown>
            </ButtonGroup>
            <NetworkRestrictedHint actions={NetworkRestrictedAction.UsageTakeover} className="mt-2" />
          </div>
        )}

        {canStopOtherUserSession && (
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{t('stopOtherUserSession.available')}</p>
            <ButtonGroup className="w-full">
              <Button
                variant="danger"
                isPending={stopSession.isPending}
                isDisabled={endRestricted}
                onPress={handleImmediateStopOtherUserSession}
              >
                <UserX className="w-4 h-4" />
                {t('stopOtherUserSession.button')}
              </Button>
              <Dropdown>
                <DropdownTrigger
                  isDisabled={endRestricted}
                  className={`${buttonVariants({ isIconOnly: true, variant: 'danger' })} inline-flex items-center justify-center`}
                >
                  <ChevronDownIcon />
                </DropdownTrigger>
                <DropdownPopover>
                  <DropdownMenu aria-label={t('stopOtherUserSession.optionsMenu.label')}>
                    <DropdownItem
                      key="stopOtherUserSessionWithNotes"
                      id="stopOtherUserSessionWithNotes"
                      onPress={handleOpenStopOtherUserSessionModal}
                    >
                      {t('stopOtherUserSession.optionsMenu.stopOtherUserSessionWithNotes.label')}
                    </DropdownItem>
                  </DropdownMenu>
                </DropdownPopover>
              </Dropdown>
            </ButtonGroup>
            <NetworkRestrictedHint actions={NetworkRestrictedAction.UsageEnd} className="mt-2" />
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
      {startSession.dialog}
      {durationDialog}
    </>
  );
}
