import { SessionNotesModal, SessionModalMode } from '../SessionNotesModal';
import { InsufficientBalanceModal } from './insufficientBalanceModal';
import { DoorControls } from './DoorControls';
import { MachineStartControls } from './MachineStartControls';
import { SupervisedStartModal } from '../SupervisedStartModal';
import { useStartSessionControlsState } from './useStartSessionControlsState';

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
