import { DEFAULT_SSH } from './CommissioningModal.state';
import { canInstall } from './CommissioningModal.activity-log.helpers';
import { canRecover } from './CommissioningModal.activity-log.helpers';
import { sessionStep } from './CommissioningModal.recovery-fields.helpers';
import type { useCommissioningInputs } from './useCommissioningInputs';

export function useCommissioningClose(model: ReturnType<typeof useCommissioningInputs>) {
  function close() {
    model.setCreatedSession(null);
    model.setStep(0);
    model.setName('');
    model.setControllerIp('');
    model.setMqttServerId(null);
    model.setHostKeyFingerprint('');
    model.setSshUsername(DEFAULT_SSH.username);
    model.setSshPassword(DEFAULT_SSH.password);
    model.setCustomSsh(false);
    model.setCancelConfirmationOpen(false);
    model.setRecoveryUsername(DEFAULT_SSH.username);
    model.setRecoveryPassword(DEFAULT_SSH.password);
    model.setCustomRecoverySsh(false);
    model.createSessionMutation.reset();
    model.confirmHostKeyMutation.reset();
    model.deliverSessionMutation.reset();
    model.recoverSessionMutation.reset();
    model.removeSessionMutation.reset();
    model.onOpenChange(false);
  }

  function createSession() {
    if (
      model.isLoading ||
      model.artifactBusy ||
      !model.artifactAvailable ||
      !model.name.trim() ||
      !model.controllerIp.trim()
    )
      return;
    if (model.selectedMqttServerId === null) return;
    model.createSessionMutation.mutate(
      {
        name: model.name.trim(),
        targetHost: model.controllerIp.trim(),
        mqttServerId: model.selectedMqttServerId,
      },
      {
        onSuccess: (created) => {
          model.setCreatedSession(created);
          model.setStep(2);
        },
      },
    );
  }

  function deliverSession() {
    if (
      !model.session ||
      model.isLoading ||
      !model.sshUsername.trim() ||
      !model.sshPassword ||
      !canInstall(model.session)
    )
      return;
    model.deliverSessionMutation.mutate({
      id: model.session.id,
      confirmInstall: true,
      temporarySsh: { username: model.sshUsername.trim(), password: model.sshPassword },
    });
    if (model.customSsh) model.setSshPassword('');
    if (model.customRecoverySsh) model.setRecoveryPassword('');
  }

  function recoverSession() {
    if (
      !model.session ||
      model.isLoading ||
      !canRecover(model.session) ||
      !model.recoveryUsername.trim() ||
      !model.recoveryPassword
    )
      return;
    model.recoverSessionMutation.mutate({
      id: model.session.id,
      confirmInstall: true,
      temporarySsh: { username: model.recoveryUsername.trim(), password: model.recoveryPassword },
    });
    if (model.customRecoverySsh) model.setRecoveryPassword('');
    if (model.customSsh) model.setSshPassword('');
  }

  function confirmHostKey(physicalIdentityConfirmed = false) {
    if (!model.session) return;
    model.confirmHostKeyMutation.mutate({
      id: model.session.id,
      hostKeyFingerprint: physicalIdentityConfirmed ? model.session.hostKeyFingerprint : model.hostKeyFingerprint,
      physicalIdentityConfirmed,
    });
  }

  function configureController(controllerId: number) {
    close();
    model.onConfigure?.(controllerId);
  }

  const activeStep = model.session ? sessionStep(model.session) : model.step;
  const title = model.session?.controllerName || model.name || model.t('commissioningUI.newController');
  return {
    ...model,
    close,
    createSession,
    deliverSession,
    recoverSession,
    confirmHostKey,
    configureController,
    activeStep,
    title,
  } as const;
}
