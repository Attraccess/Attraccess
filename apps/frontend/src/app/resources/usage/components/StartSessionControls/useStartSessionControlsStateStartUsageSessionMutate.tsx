import { useState, useCallback } from 'react';
import {
  useResourcesServiceResourceUsageStartSession,
  useResourcesServiceUnlockDoor,
  StartUsageSessionDto,
  useResourcesServiceUnlatchDoor,
  useResourcesServiceLockDoor,
  ApiError,
  FormSubmissionRequestDto,
} from '@attraccess/react-query-client';
import { useResourceFormsSubmission } from '../../../forms/hooks/useResourceFormsSubmission';
import { ResourceFormAction } from '../../../details/forms/types';
import type { useStartSessionControlsStateInputs } from './useStartSessionControlsStateInputs';

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
