import { SessionNotesModal, SessionModalMode } from '../SessionNotesModal/index';
import { InsufficientBalanceModal } from './insufficientBalanceModal/index';
import { DoorControls } from './DoorControls';
import { MachineStartControls } from './MachineStartControls';
import { SupervisedStartModal } from '../SupervisedStartModal/index';
import { StartBlockedGate } from '../StartBlockedGate';
import { useCallback, useState } from 'react';
import {
  StartUsageSessionDto,
  useUnlockDoor,
  useUnlatchDoor,
  useLockDoor,
  useOpenDoor,
  ApiError,
  FormSubmissionRequestDto,
  UseResourceUsageGetActiveSessionKeyFn,
  UseResourceUsageGetHistoryKeyFn,
  useGetOneResourceById,
  ResourceType,
  SupervisionMode,
} from '@attraccess/react-query-client';
import { useStartSessionWithConfirmation } from '../../hooks/useStartSessionWithConfirmation';
import { useSessionDurationEstimate } from '../../hooks/useSessionDurationEstimate';
import { ResourceFormAction } from '../../../../forms/types';
import { useResourceFormsSubmission } from '../../../forms/hooks/useResourceFormsSubmission';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import en from './translations/en.json';
import de from './translations/de.json';
import { getTranslationKeyForApiError } from '../../../../../utils/apiError';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';

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
  const { resourceId, insufficientBalanceDesiredAmount, requiresSupervision, ...divProps } = props;

  const { data: resource } = useGetOneResourceById({ path: { id: resourceId } });

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

  const onStartSuccessBase = useCallback(() => {
    setIsNotesModalOpen(false);

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
    },
    [t, toast, resource, tExists],
  );

  const { requestForms, modal: formsModal, clearFormsDraft } = useResourceFormsSubmission(resourceId);
  const { ask: askDuration, dialog: durationDialog } = useSessionDurationEstimate(resourceId);
  const notifyStartSuccess = onStartSuccessBase;
  const onStartSuccess = useCallback(() => {
    clearFormsDraft();
    notifyStartSuccess();
  }, [clearFormsDraft, notifyStartSuccess]);
  const startSession = useStartSessionWithConfirmation(resourceId, {
    onSuccess: onStartSuccess,
    onError: (error) => onStartError(error),
  });
  const {
    start: startSessionWithConfirmation,
    isPending: startUsageSessionIsPending,
    dialog: confirmationDialog,
  } = startSession;

  const { mutate: unlockDoorMutate, isPending: unlockDoorIsPending } = useUnlockDoor(undefined, {
    onSuccess: onStartSuccess,
    onError: (error) => {
      onStartError(error as ApiError);
    },
  });

  const { mutate: lockDoorMutate, isPending: lockDoorIsPending } = useLockDoor(undefined, {
    onSuccess: onStartSuccess,
    onError: (error) => {
      onStartError(error as ApiError);
    },
  });

  const { mutate: unlatchDoorMutate, isPending: unlatchDoorIsPending } = useUnlatchDoor(undefined, {
    onSuccess: onStartSuccess,
    onError: (error) => {
      onStartError(error as ApiError);
    },
  });

  const { mutate: openDoorMutate, isPending: openDoorIsPending } = useOpenDoor(undefined, {
    onSuccess: onStartSuccess,
    onError: (error) => {
      onStartError(error as ApiError);
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
      startSessionWithConfirmation(requestBody, async (error) => {
        if (!isFormsMissingError(error)) {
          return;
        }

        const retrySubmissions = await gatherFormSubmissions(action);
        if (!retrySubmissions) {
          return;
        }

        startSessionWithConfirmation({ ...requestBody, formSubmissions: retrySubmissions });
      });
    },
    [gatherFormSubmissions, isFormsMissingError, startSessionWithConfirmation],
  );

  const handleStartSession = useCallback(
    async (opts?: StartUsageSessionDto) => {
      const action: ResourceFormAction = opts?.forceTakeOver ? 'takeover' : 'start';
      // The estimate comes first and stays in the request body, so every retry (forms, plugin confirmation) sends it.
      const estimate = await askDuration();
      if (estimate === null) {
        return;
      }
      const formSubmissions = await gatherFormSubmissions(action);
      if (formSubmissions === null) {
        return;
      }

      const requestBody: StartUsageSessionDto = {
        ...(opts ?? {}),
        projectId: selectedProjectId,
        formSubmissions,
        ...(estimate === undefined ? {} : { estimatedDurationMinutes: estimate }),
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
      askDuration,
      gatherFormSubmissions,
      needsSupervisor,
      selectedProjectId,
      submitStartSessionWithRetry,
      setIsNotesModalOpen,
      setSupervisedRequestBody,
    ],
  );

  const handleOpenStartSessionModal = () => {
    setIsNotesModalOpen(true);
  };

  const handleLockDoor = useCallback(
    () => lockDoorMutate({ path: { resourceId: resourceId } }),
    [lockDoorMutate, resourceId],
  );
  const handleUnlockDoor = useCallback(
    () => unlockDoorMutate({ path: { resourceId: resourceId } }),
    [resourceId, unlockDoorMutate],
  );
  const handleUnlatchDoor = useCallback(
    () => unlatchDoorMutate({ path: { resourceId: resourceId } }),
    [resourceId, unlatchDoorMutate],
  );
  const handleOpenDoor = useCallback(
    () => openDoorMutate({ path: { resourceId: resourceId } }),
    [openDoorMutate, resourceId],
  );

  return (
    <div {...divProps}>
      <div className="space-y-4">
        {resource?.type === 'door' && (
          <DoorControls
            onLock={handleLockDoor}
            onUnlock={handleUnlockDoor}
            onUnlatch={resource.separateUnlockAndUnlatch ? handleUnlatchDoor : undefined}
            onOpen={handleOpenDoor}
            lockIsPending={lockDoorIsPending}
            unlockIsPending={unlockDoorIsPending}
            unlatchIsPending={unlatchDoorIsPending}
            openIsPending={openDoorIsPending}
            separateUnlockAndUnlatch={resource.separateUnlockAndUnlatch}
            accessOnly={resource.accessOnly}
          />
        )}
        {/* Plugins block session starts only (pre-start hook); door actions never pass that hook, so the door
            controls stay outside the gate. Gating here means every call site gets it, the maintenance view too. */}
        {resource?.type === 'machine' && (
          <StartBlockedGate resourceId={resourceId}>
            <MachineStartControls
              selectedProjectId={selectedProjectId}
              onProjectChange={setSelectedProjectId}
              onStart={() => void handleStartSession()}
              onStartWithNotes={handleOpenStartSessionModal}
              isStarting={startUsageSessionIsPending}
            />
          </StartBlockedGate>
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
      {durationDialog}
      {confirmationDialog}
    </div>
  );
}
