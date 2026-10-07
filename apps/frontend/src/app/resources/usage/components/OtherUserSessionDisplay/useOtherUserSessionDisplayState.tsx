import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useResourcesServiceResourceUsageStartSession,
  useResourcesServiceResourceUsageGetActiveSession,
  useResourcesServiceResourceUsageCanControl,
  useResourcesServiceGetOneResourceById,
  useAccessControlServiceResourceIntroducersIsIntroducer,
  useResourcesServiceResourceUsageEndSession,
  useMessagingServiceMessagingContactResourceHolder,
  FormSubmissionRequestDto,
} from '@attraccess/react-query-client';
import { useInvalidateSessionHistory } from './useInvalidateSessionHistory';
import { useAuth } from '../../../../../hooks/useAuth';
import { useToastMessage } from '../../../../../components/toastProvider';
import en from './translations/en.json';
import de from './translations/de.json';
import { useResourceFormsSubmission } from '../../../forms/hooks/useResourceFormsSubmission';
import type { OtherUserSessionDisplayProps } from './index';

export function useOtherUserSessionDisplayState({ resourceId }: OtherUserSessionDisplayProps) {
  const { t } = useTranslations({ en, de });
  const { hasPermission, user } = useAuth();
  const { success, error: showError } = useToastMessage();
  const invalidateSessionHistory = useInvalidateSessionHistory(resourceId);
  const navigate = useNavigate();
  const [isTakeoverNotesModalOpen, setIsTakeoverNotesModalOpen] = useState(false);
  const [isStopOtherUserSessionNotesModalOpen, setIsStopOtherUserSessionNotesModalOpen] = useState(false);
  const { requestForms, modal: formsModal, clearFormsDraft } = useResourceFormsSubmission(resourceId);

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

  const canUpdateResources = hasPermission('resources.update');
  const canStartSession = canUpdateResources || access?.canControl || permissions?.isIntroducer;
  const canTakeover = resource?.allowTakeOver && canStartSession;
  const canStopOtherUserSession = permissions?.isIntroducer || canUpdateResources;

  const startSession = useResourcesServiceResourceUsageStartSession({
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
  });

  const stopSession = useResourcesServiceResourceUsageEndSession({
    onSuccess: () => {
      clearFormsDraft();
      setIsTakeoverNotesModalOpen(false);

      invalidateSessionHistory();

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
  return {
    t,
    user,
    isTakeoverNotesModalOpen,
    setIsTakeoverNotesModalOpen,
    isStopOtherUserSessionNotesModalOpen,
    setIsStopOtherUserSessionNotesModalOpen,
    formsModal,
    activeSession,
    canTakeover,
    canStopOtherUserSession,
    startSession,
    stopSession,
    contactHolder,
    handleContactHolder,
    handleStopOtherUserSessionWithNotes,
    handleTakeoverWithNotes,
    handleImmediateTakeover,
    handleOpenTakeoverModal,
    handleOpenStopOtherUserSessionModal,
    handleImmediateStopOtherUserSession,
  } as const;
}
