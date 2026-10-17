import { SessionNotesModal, SessionModalMode } from '../SessionNotesModal/index';
import { InsufficientBalanceModal } from './insufficientBalanceModal/index';
import { DoorControls } from './DoorControls';
import { MachineStartControls } from './MachineStartControls';
import { SupervisedStartModal } from '../SupervisedStartModal/index';
import { useCallback, useState } from 'react';
import {
  StartUsageSessionDto,
  useResourcesServiceResourceUsageStartSession,
  useResourcesServiceUnlockDoor,
  useResourcesServiceUnlatchDoor,
  useResourcesServiceLockDoor,
  ApiError,
  FormSubmissionRequestDto,
  UseResourcesServiceResourceUsageGetActiveSessionKeyFn,
  UseResourcesServiceResourceUsageGetHistoryKeyFn,
  useResourcesServiceGetOneResourceById,
  ResourceType,
  SupervisionMode,
} from '@attraccess/react-query-client';
import { ResourceFormAction } from '../../../details/forms/types';
import { useResourceFormsSubmission } from '../../../forms/hooks/useResourceFormsSubmission';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import en from './translations/en.json';
import de from './translations/de.json';
import { getTranslationKeyForApiError } from '../../../../../utils/apiError';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';

export function useStartSessionControlsStateOutput(
  model: ReturnType<typeof useStartSessionControlsStateStartUsageSessionMutate>,
) {
  const {
    gatherFormSubmissions,
    selectedProjectId,
    needsSupervisor,
    setIsNotesModalOpen,
    setSupervisedRequestBody,
    submitStartSessionWithRetry,
    lockDoorMutate,
    resourceId,
    unlockDoorMutate,
    unlatchDoorMutate,
  } = model;
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
      if (needsSupervisor) {
        setIsNotesModalOpen(false);
        setSupervisedRequestBody(requestBody);
        return;
      }

      submitStartSessionWithRetry(action, requestBody);
    },
    [
      gatherFormSubmissions,
      needsSupervisor,
      selectedProjectId,
      submitStartSessionWithRetry,
      setIsNotesModalOpen,
      setSupervisedRequestBody,
    ],
  );

  const handleOpenStartSessionModal = () => {
    model.setIsNotesModalOpen(true);
  };

  const handleLockDoor = useCallback(() => lockDoorMutate({ resourceId: resourceId }), [lockDoorMutate, resourceId]);
  const handleUnlockDoor = useCallback(
    () => unlockDoorMutate({ resourceId: resourceId }),
    [resourceId, unlockDoorMutate],
  );
  const handleUnlatchDoor = useCallback(
    () => unlatchDoorMutate({ resourceId: resourceId }),
    [resourceId, unlatchDoorMutate],
  );
  return {
    resourceId: model.resourceId,
    insufficientBalanceDesiredAmount: model.insufficientBalanceDesiredAmount,
    divProps: model.divProps,
    resource: model.resource,
    t: model.t,
    isNotesModalOpen: model.isNotesModalOpen,
    setIsNotesModalOpen: model.setIsNotesModalOpen,
    isInsufficientBalance: model.isInsufficientBalance,
    setIsInsufficientBalance: model.setIsInsufficientBalance,
    supervisedRequestBody: model.supervisedRequestBody,
    setSupervisedRequestBody: model.setSupervisedRequestBody,
    onStartSuccess: model.onStartSuccess,
    startUsageSessionIsPending: model.startUsageSessionIsPending,
    unlockDoorIsPending: model.unlockDoorIsPending,
    lockDoorIsPending: model.lockDoorIsPending,
    unlatchDoorIsPending: model.unlatchDoorIsPending,
    selectedProjectId: model.selectedProjectId,
    setSelectedProjectId: model.setSelectedProjectId,
    formsModal: model.formsModal,
    handleStartSession,
    handleOpenStartSessionModal,
    handleLockDoor,
    handleUnlockDoor,
    handleUnlatchDoor,
  } as const;
}

export function useStartSessionControlsState(
  props: Readonly<StartSessionControlsProps> & React.HTMLAttributes<HTMLDivElement>,
) {
  const useStartSessionControlsStateInputsModel = useStartSessionControlsStateInputs(props);
  const useStartSessionControlsStateStartUsageSessionMutateModel = useStartSessionControlsStateStartUsageSessionMutate(
    useStartSessionControlsStateInputsModel,
  );
  return useStartSessionControlsStateOutput(useStartSessionControlsStateStartUsageSessionMutateModel);
}

export function useStartSessionControlsStateStartUsageSessionMutate(
  model: ReturnType<typeof useStartSessionControlsStateInputs>,
) {
  const { requestForms, modal: formsModal, clearFormsDraft } = useResourceFormsSubmission(model.resourceId);
  const onStartSuccess = useCallback(() => {
    clearFormsDraft();
    model.onStartSuccess();
  }, [clearFormsDraft, model.onStartSuccess]);
  const { mutate: startUsageSessionMutate, isPending: startUsageSessionIsPending } =
    useResourcesServiceResourceUsageStartSession({
      onSuccess: onStartSuccess,
      onError: (error) => {
        model.onStartError(error as ApiError);
      },
    });

  const { mutate: unlockDoorMutate, isPending: unlockDoorIsPending } = useResourcesServiceUnlockDoor({
    onSuccess: onStartSuccess,
    onError: (error) => {
      model.onStartError(error as ApiError);
    },
  });

  const { mutate: lockDoorMutate, isPending: lockDoorIsPending } = useResourcesServiceLockDoor({
    onSuccess: onStartSuccess,
    onError: (error) => {
      model.onStartError(error as ApiError);
    },
  });

  const { mutate: unlatchDoorMutate, isPending: unlatchDoorIsPending } = useResourcesServiceUnlatchDoor({
    onSuccess: onStartSuccess,
    onError: (error) => {
      model.onStartError(error as ApiError);
    },
  });

  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(undefined);

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
        { resourceId: model.resourceId, requestBody },
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
              resourceId: model.resourceId,
              requestBody: {
                ...requestBody,
                formSubmissions: retrySubmissions,
              },
            });
          },
        },
      );
    },
    [gatherFormSubmissions, isFormsMissingError, model.resourceId, startUsageSessionMutate],
  );
  return {
    ...model,
    onStartSuccess,
    startUsageSessionMutate,
    startUsageSessionIsPending,
    unlockDoorMutate,
    unlockDoorIsPending,
    lockDoorMutate,
    lockDoorIsPending,
    unlatchDoorMutate,
    unlatchDoorIsPending,
    selectedProjectId,
    setSelectedProjectId,
    requestForms,
    formsModal,
    isFormsMissingError,
    gatherFormSubmissions,
    submitStartSessionWithRetry,
  } as const;
}

export function useStartSessionControlsStateInputs(
  props: Readonly<StartSessionControlsProps> & React.HTMLAttributes<HTMLDivElement>,
) {
  const { resourceId, insufficientBalanceDesiredAmount, requiresSupervision, ...divProps } = props;

  const { data: resource } = useResourcesServiceGetOneResourceById({ id: resourceId });

  // supervision_required forbids a solo start for everyone, introduced or not — the backend rejects
  // it outright. Deciding that here rather than at the call sites means no caller can forget it:
  // the maintenance view renders these controls too, with no knowledge of supervision (ATT-815).
  const needsSupervisor =
    (requiresSupervision ?? false) || resource?.supervisionMode === SupervisionMode.SUPERVISION_REQUIRED;

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
  return {
    resourceId,
    insufficientBalanceDesiredAmount,
    requiresSupervision,
    divProps,
    resource,
    needsSupervisor,
    t,
    tExists,
    queryClient,
    toast,
    isNotesModalOpen,
    setIsNotesModalOpen,
    isInsufficientBalance,
    setIsInsufficientBalance,
    supervisedRequestBody,
    setSupervisedRequestBody,
    onStartSuccess,
    onStartError,
    props,
  } as const;
}

export interface StartSessionControlsProps {
  resourceId: number;
  insufficientBalanceDesiredAmount?: number;
  /**
   * When true the user is not introduced but the resource allows supervision:
   * starting opens the supervisor-selection popup instead of starting directly.
   *
   * Resources whose supervisionMode is SUPERVISION_REQUIRED are handled here regardless of this
   * prop — see `needsSupervisor` below.
   */
  requiresSupervision?: boolean;
}

export function StartSessionControls(
  props: Readonly<StartSessionControlsProps> & React.HTMLAttributes<HTMLDivElement>,
) {
  const {
    resourceId,
    insufficientBalanceDesiredAmount,
    divProps,
    resource,
    t,
    isNotesModalOpen,
    setIsNotesModalOpen,
    isInsufficientBalance,
    setIsInsufficientBalance,
    supervisedRequestBody,
    setSupervisedRequestBody,
    onStartSuccess,
    startUsageSessionIsPending,
    unlockDoorIsPending,
    lockDoorIsPending,
    unlatchDoorIsPending,
    selectedProjectId,
    setSelectedProjectId,
    formsModal,
    handleStartSession,
    handleOpenStartSessionModal,
    handleLockDoor,
    handleUnlockDoor,
    handleUnlatchDoor,
  } = useStartSessionControlsState(props);

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
