import { useCallback, useState } from 'react';
import { formatUserDisplayName } from '@attraccess/shared';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, UserX } from 'lucide-react';
import { NetworkRestrictedAction } from '@attraccess/application-models';
import { useNetworkRestriction } from '../../../../../hooks/useNetworkRestriction';
import { NetworkRestrictedHint } from '../../../../../components/networkRestriction/NetworkRestrictedHint';
import { AttraccessUser, Button, DateTimeDisplay, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  FormSubmissionRequestDto,
  ResourceUsage,
  useMessagingContactResourceHolder,
  useResourceUsageEndSession,
} from '@attraccess/react-query-client';
import { SessionStatusCard } from '../SessionStatusCard';
import { SessionNotesModal, SessionModalMode } from '../SessionNotesModal';
import { useInvalidateSessionHistory } from '../OtherUserSessionDisplay';
import { useResourceFormsSubmission } from '../../../forms/hooks/useResourceFormsSubmission';
import { useToastMessage } from '../../../../../components/toastProvider';
import { useRefreshNetworkRestrictionOnError } from '../../../../../hooks/useRefreshNetworkRestrictionOnError';
import { SessionAutoEnd } from '../SessionAutoEnd';
import { useMaintenanceCheck } from '../../hooks/useMaintenanceCheck';
import { useCanEndOtherSessions } from '../../hooks/useCanEndOtherSessions';
import en from './translations/en.json';
import de from './translations/de.json';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';

export interface ParallelSessionsDisplayProps {
  resourceId: number;
  /** Active sessions of everybody except the current user. */
  usages: ResourceUsage[];
  activeSessionCount: number;
  maxParallelSessions: number;
}

/** Other people's sessions on a machine that allows several parallel sessions. */
export function ParallelSessionsDisplay({
  resourceId,
  usages,
  activeSessionCount,
  maxParallelSessions,
}: ParallelSessionsDisplayProps) {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const navigate = useNavigate();
  const { isRestricted } = useNetworkRestriction();
  const endRestricted = isRestricted(NetworkRestrictedAction.UsageEnd);
  const { success, error: showError, apiError } = useToastMessage();
  const refreshNetworkRestriction = useRefreshNetworkRestrictionOnError();
  const invalidateSessionHistory = useInvalidateSessionHistory(resourceId);
  const { requestForms, modal: formsModal, clearFormsDraft } = useResourceFormsSubmission(resourceId);
  const [usageToEnd, setUsageToEnd] = useState<ResourceUsage | null>(null);
  const [contactingUserId, setContactingUserId] = useState<number | null>(null);
  const { canEndSession } = useCanEndOtherSessions(resourceId);
  const {
    requestMaintenanceCheck,
    showMaintenanceRequestResult,
    modal: maintenanceCheckModal,
  } = useMaintenanceCheck(resourceId);

  const endSession = useResourceUsageEndSession(undefined, {
    onSuccess: (ended) => {
      clearFormsDraft();
      setUsageToEnd(null);
      invalidateSessionHistory();
      success({ title: t('endSession.successful'), description: t('endSession.successfulDescription') });
      showMaintenanceRequestResult(ended?.maintenanceRequestFiled);
    },
    onError: (err) => {
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
    onSettled: () => setContactingUserId(null),
  });

  const confirmEnd = useCallback(
    async (notes: string) => {
      if (!usageToEnd) return;
      // Only asked when the session is the viewer's own.
      const checkAnswer = await requestMaintenanceCheck(usageToEnd.userId);
      if (!checkAnswer) return;
      let formSubmissions: FormSubmissionRequestDto[];
      try {
        formSubmissions = await requestForms('end');
      } catch (error) {
        if ((error as Error).message === 'user_cancelled_forms') {
          return;
        }
        throw error;
      }
      const body = { ...checkAnswer, usageId: usageToEnd.id, notes, formSubmissions };
      endSession.mutate({ path: { resourceId }, body });
    },
    [endSession, requestForms, requestMaintenanceCheck, resourceId, usageToEnd],
  );

  const isFull = activeSessionCount >= maxParallelSessions;
  const counts = { count: activeSessionCount, max: maxParallelSessions };

  return (
    <>
      <SessionStatusCard
        accent={isFull ? 'danger' : 'warning'}
        statusLabel={isFull ? t('full', counts) : t('inUse', counts)}
        data-cy="parallel-sessions-card"
        chipDataCy="parallel-sessions-chip"
      >
        {usages.length > 0 && (
          <>
            <p className="text-sm text-muted">{t('otherSessions')}</p>
            <ul className="space-y-3">
              {usages.map((usage) => {
                const canEnd = canEndSession(usage);
                const name = usage.user ? formatUserDisplayName(usage.user) : t('unknownUser');
                return (
                  <li
                    key={usage.id}
                    className="flex flex-wrap items-center justify-between gap-2"
                    data-cy={`parallel-session-${usage.id}`}
                  >
                    <div className="min-w-0 space-y-1">
                      {usage.user ? (
                        <AttraccessUser user={usage.user} />
                      ) : (
                        <p className="text-sm font-medium">{t('unknownUser')}</p>
                      )}
                      <p className="text-xs text-muted">
                        {t('sessionStarted')} <DateTimeDisplay date={usage.startTime} />
                      </p>
                      {usage.autoEndAt && <SessionAutoEnd resourceId={resourceId} usage={usage} canExtend={canEnd} />}
                      {usage.supervisorUser && (
                        <div className="flex items-center gap-1 text-xs text-muted">
                          {t('supervisedBy')} <AttraccessUser user={usage.supervisorUser} />
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {usage.userId !== undefined && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t('contact.ariaLabel', { name })}
                          isPending={contactHolder.isPending && contactingUserId === usage.userId}
                          isDisabled={contactHolder.isPending}
                          onPress={() => {
                            setContactingUserId(usage.userId ?? null);
                            contactHolder.mutate({ path: { resourceId }, query: { userId: usage.userId } });
                          }}
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          {t('contact.button')}
                        </Button>
                      )}
                      {canEnd && (
                        <Button
                          variant="danger-soft"
                          size="sm"
                          aria-label={t('endSession.ariaLabel', { name })}
                          isDisabled={endRestricted}
                          onPress={() => setUsageToEnd(usage)}
                        >
                          <UserX className="w-3.5 h-3.5" />
                          {t('endSession.button')}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {usages.some(canEndSession) && <NetworkRestrictedHint actions={NetworkRestrictedAction.UsageEnd} />}
          </>
        )}
      </SessionStatusCard>

      <SessionNotesModal
        isOpen={usageToEnd !== null}
        onClose={() => setUsageToEnd(null)}
        onConfirm={(notes) => void confirmEnd(notes)}
        mode={SessionModalMode.END}
        isSubmitting={endSession.isPending}
        description={
          usageToEnd
            ? t('endSession.confirm', {
                name: usageToEnd.user ? formatUserDisplayName(usageToEnd.user) : t('unknownUser'),
              })
            : undefined
        }
      />
      {maintenanceCheckModal}
      {formsModal}
    </>
  );
}
