import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, UserX } from 'lucide-react';
import { AttraccessUser, Button, DateTimeDisplay, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  FormSubmissionRequestDto,
  ResourceUsage,
  useAccessControlServiceResourceIntroducersIsIntroducer,
  useMessagingServiceMessagingContactResourceHolder,
  useResourcesServiceResourceUsageEndSession,
} from '@attraccess/react-query-client';
import { SessionStatusCard } from '../SessionStatusCard';
import { SessionNotesModal, SessionModalMode } from '../SessionNotesModal';
import { useInvalidateSessionHistory } from '../OtherUserSessionDisplay';
import { useResourceFormsSubmission } from '../../../forms/hooks/useResourceFormsSubmission';
import { useToastMessage } from '../../../../../components/toastProvider';
import { useAuth } from '../../../../../hooks/useAuth';
import en from './translations/en.json';
import de from './translations/de.json';

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
  const { t } = useTranslations({ en, de });
  const { hasPermission, user } = useAuth();
  const navigate = useNavigate();
  const { success, error: showError } = useToastMessage();
  const invalidateSessionHistory = useInvalidateSessionHistory(resourceId);
  const { requestForms, modal: formsModal, clearFormsDraft } = useResourceFormsSubmission(resourceId);
  const [usageToEnd, setUsageToEnd] = useState<ResourceUsage | null>(null);

  const { data: permissions } = useAccessControlServiceResourceIntroducersIsIntroducer(
    { resourceId, userId: user?.id as number, includeGroups: true },
    undefined,
    { enabled: !!user?.id },
  );
  // Same gating as the limit-1 force-stop; the server makes the final call (it also lets supervisors end their own).
  const canEndAny = hasPermission('resources.update') || !!permissions?.isIntroducer;

  const endSession = useResourcesServiceResourceUsageEndSession({
    onSuccess: () => {
      clearFormsDraft();
      setUsageToEnd(null);
      invalidateSessionHistory();
      success({ title: t('endSession.successful'), description: t('endSession.successfulDescription') });
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

  const confirmEnd = useCallback(
    async (notes: string) => {
      if (!usageToEnd) return;
      let formSubmissions: FormSubmissionRequestDto[] = [];
      try {
        formSubmissions = await requestForms('end');
      } catch (error) {
        if ((error as Error).message === 'user_cancelled_forms') {
          return;
        }
        throw error;
      }
      endSession.mutate({ resourceId, requestBody: { usageId: usageToEnd.id, notes, formSubmissions } });
    },
    [endSession, requestForms, resourceId, usageToEnd],
  );

  const isFull = activeSessionCount >= maxParallelSessions;
  const counts = { count: activeSessionCount, max: maxParallelSessions };

  return (
    <>
      <SessionStatusCard
        accent="warning"
        statusLabel={isFull ? t('full', counts) : t('inUse', counts)}
        data-cy="parallel-sessions-card"
        chipDataCy="parallel-sessions-chip"
      >
        {usages.length > 0 && (
          <>
            <p className="text-sm text-muted">{t('otherSessions')}</p>
            <ul className="space-y-3">
              {usages.map((usage) => {
                const canEnd = canEndAny || (!!user && usage.supervisorUserId === user.id);
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
                          isPending={contactHolder.isPending}
                          onPress={() => contactHolder.mutate({ resourceId, userId: usage.userId })}
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          {t('contact.button')}
                        </Button>
                      )}
                      {canEnd && (
                        <Button variant="danger-soft" size="sm" onPress={() => setUsageToEnd(usage)}>
                          <UserX className="w-3.5 h-3.5" />
                          {t('endSession.button')}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </SessionStatusCard>

      <SessionNotesModal
        isOpen={usageToEnd !== null}
        onClose={() => setUsageToEnd(null)}
        onConfirm={(notes) => void confirmEnd(notes)}
        mode={SessionModalMode.END}
        isSubmitting={endSession.isPending}
      />
      {formsModal}
    </>
  );
}
