import { useCallback } from 'react';
import { StartUsageSessionDto } from '@attraccess/react-query-client';
import { ResourceFormAction } from '../../../details/forms/types';
import type { useStartSessionControlsStateStartUsageSessionMutate } from './useStartSessionControlsStateStartUsageSessionMutate';

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
