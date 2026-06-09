import { useState, useCallback } from 'react';
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
  ApiError,
  ResourceType,
  FormSubmissionRequestDto,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import en from './translations/en.json';
import de from './translations/de.json';
import { getTranslationKeyForApiError } from '../../../../../utils/apiError';
import { InsufficientBalanceModal } from './insufficientBalanceModal';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import { useResourceFormsSubmission } from '../../../forms/hooks/useResourceFormsSubmission';
import { ResourceFormAction } from '../../../details/forms/types';
import { DoorControls } from './DoorControls';
import { MachineStartControls } from './MachineStartControls';
import { SupervisedStartModal } from '../SupervisedStartModal';

interface StartSessionControlsProps {
  resourceId: number;
  insufficientBalanceDesiredAmount?: number;
  /**
   * When true the user is not introduced but the resource allows supervision:
   * starting opens the supervisor-selection popup instead of starting directly.
   */
  requiresSupervision?: boolean;
}

export function StartSessionControls(
  props: Readonly<StartSessionControlsProps> & React.HTMLAttributes<HTMLDivElement>,
) {
  const { resourceId, insufficientBalanceDesiredAmount, requiresSupervision, ...divProps } = props;

  const { data: resource } = useResourcesServiceGetOneResourceById({ id: resourceId });

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
  const queryClient = useQueryClient();
  const toast = useToastMessage();

  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [isInsufficientBalance, setIsInsufficientBalance] = useState(false);
  const [supervisedRequestBody, setSupervisedRequestBody] = useState<StartUsageSessionDto | null>(null);

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

    if (!resource) {
      return;
    }

    switch (resource.type) {
      case ResourceType.MACHINE:
        toast.success({
          title: t('machine.sessionStarted'),
          description: t('machine.sessionStartedDescription'),
        });
        break;

      case ResourceType.DOOR:
        toast.success({
          title: t('door.success.title'),
          description: t('door.success.description'),
        });
        break;

      default: {
        const exhaustiveCheck: never = resource?.type;
        throw new Error(`Unknown resource type: ${exhaustiveCheck}`);
      }
    }
  }, [resourceId, t, queryClient, toast, resource]);

  const onStartError = useCallback(
    (error: ApiError) => {
      if (!resource) {
        return;
      }

      const { errorMessage } = getTranslationKeyForApiError({
        error,
        t,
        tExists,
        baseTranslationKey: 'api',
      });

      if (errorMessage === 'INSUFFICIENT_BALANCE') {
        setIsInsufficientBalance(true);
      }

      toast.apiError({
        error,
        t,
        tExists,
        baseTranslationKey: 'api',
      });

      console.error('Failed to start session:', JSON.stringify(error));
    },
    [t, toast, resource, tExists],
  );

  const { mutate: startUsageSessionMutate, isPending: startUsageSessionIsPending } =
    useResourcesServiceResourceUsageStartSession({
      onSuccess: onStartSuccess,
      onError: (error) => {
        onStartError(error as ApiError);
      },
    });

  const { mutate: unlockDoorMutate, isPending: unlockDoorIsPending } = useResourcesServiceUnlockDoor({
    onSuccess: onStartSuccess,
    onError: (error) => {
      onStartError(error as ApiError);
    },
  });

  const { mutate: lockDoorMutate, isPending: lockDoorIsPending } = useResourcesServiceLockDoor({
    onSuccess: onStartSuccess,
    onError: (error) => {
      onStartError(error as ApiError);
    },
  });

  const { mutate: unlatchDoorMutate, isPending: unlatchDoorIsPending } = useResourcesServiceUnlatchDoor({
    onSuccess: onStartSuccess,
    onError: (error) => {
      onStartError(error as ApiError);
    },
  });

  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(undefined);

  const { requestForms, modal: formsModal } = useResourceFormsSubmission(resourceId);

  const isFormsMissingError = useCallback((error: unknown) => {
    if (!(error instanceof ApiError)) {
      return false;
    }

    if (error.status !== 400) {
      return false;
    }

    const rawMessage = (error.body as { message?: string | string[] })?.message ?? error.message;
    const message = Array.isArray(rawMessage) ? rawMessage.join(' ') : rawMessage;

    return (
      typeof message === 'string' && message.toLowerCase().includes('form') && message.toLowerCase().includes('submit')
    );
  }, []);

  const gatherFormSubmissions = useCallback(
    async (action: ResourceFormAction): Promise<FormSubmissionRequestDto[] | null> => {
      try {
        return await requestForms(action);
      } catch (error) {
        if ((error as Error).message === 'user_cancelled_forms') {
          return null;
        }
        throw error;
      }
    },
    [requestForms],
  );

  const submitStartSessionWithRetry = useCallback(
    (action: ResourceFormAction, requestBody: StartUsageSessionDto) => {
      startUsageSessionMutate(
        { resourceId, requestBody },
        {
          onError: async (error) => {
            if (!isFormsMissingError(error)) {
              return;
            }

            const retrySubmissions = await gatherFormSubmissions(action);
            if (!retrySubmissions) {
              return;
            }

            startUsageSessionMutate({
              resourceId,
              requestBody: {
                ...requestBody,
                formSubmissions: retrySubmissions,
              },
            });
          },
        },
      );
    },
    [gatherFormSubmissions, isFormsMissingError, resourceId, startUsageSessionMutate],
  );

  const handleStartSession = useCallback(
    async (opts?: StartUsageSessionDto) => {
      const action: ResourceFormAction = opts?.forceTakeOver ? 'takeover' : 'start';
      const formSubmissions = await gatherFormSubmissions(action);
      if (formSubmissions === null) {
        return;
      }

      const requestBody: StartUsageSessionDto = {
        ...(opts ?? {}),
        projectId: selectedProjectId,
        formSubmissions,
      };

      // Not introduced but supervision is allowed: defer to supervisor approval
      // instead of starting directly. The user-facing start flow is unchanged.
      if (requiresSupervision) {
        setIsNotesModalOpen(false);
        setSupervisedRequestBody(requestBody);
        return;
      }

      submitStartSessionWithRetry(action, requestBody);
    },
    [gatherFormSubmissions, requiresSupervision, selectedProjectId, submitStartSessionWithRetry],
  );

  const handleOpenStartSessionModal = () => {
    setIsNotesModalOpen(true);
  };

  const handleLockDoor = useCallback(() => lockDoorMutate({ resourceId }), [lockDoorMutate, resourceId]);
  const handleUnlockDoor = useCallback(() => unlockDoorMutate({ resourceId }), [resourceId, unlockDoorMutate]);
  const handleUnlatchDoor = useCallback(() => unlatchDoorMutate({ resourceId }), [resourceId, unlatchDoorMutate]);

  return (
    <div {...divProps}>
      <div className="space-y-4">
        {resource?.type === 'door' && (
          <DoorControls
            t={t}
            onLock={handleLockDoor}
            onUnlock={handleUnlockDoor}
            onUnlatch={resource.separateUnlockAndUnlatch ? handleUnlatchDoor : undefined}
            lockIsPending={lockDoorIsPending}
            unlockIsPending={unlockDoorIsPending}
            unlatchIsPending={unlatchDoorIsPending}
            separateUnlockAndUnlatch={resource.separateUnlockAndUnlatch}
          />
        )}
        {resource?.type === 'machine' && (
          <MachineStartControls
            t={t}
            selectedProjectId={selectedProjectId}
            onProjectChange={setSelectedProjectId}
            onStart={() => void handleStartSession()}
            onStartWithNotes={handleOpenStartSessionModal}
            isStarting={startUsageSessionIsPending}
          />
        )}
      </div>

      <SessionNotesModal
        isOpen={isNotesModalOpen}
        onClose={() => setIsNotesModalOpen(false)}
        onConfirm={(notes) => void handleStartSession({ notes, forceTakeOver: false })}
        mode={SessionModalMode.START}
        isSubmitting={startUsageSessionIsPending}
      />

      <InsufficientBalanceModal
        isOpen={isInsufficientBalance}
        onClose={() => setIsInsufficientBalance(false)}
        desiredAmount={insufficientBalanceDesiredAmount}
      />

      {supervisedRequestBody && (
        <SupervisedStartModal
          isOpen={true}
          onClose={() => setSupervisedRequestBody(null)}
          resourceId={resourceId}
          requestBody={supervisedRequestBody}
          onApproved={() => {
            setSupervisedRequestBody(null);
            onStartSuccess();
          }}
        />
      )}
      {formsModal}
    </div>
  );
}
