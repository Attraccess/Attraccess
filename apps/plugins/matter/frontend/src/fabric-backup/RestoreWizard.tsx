import { Button, StandardModal, StatusAlert, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import { Chip, Input, Label, ModalBody, ModalFooter, ModalHeader, ModalHeading, TextField } from '@heroui/react';
import { useState } from 'react';
import { useMatterTranslations } from '../i18n';
import {
  cancelRestore,
  confirmRestore,
  readFileAsBase64,
  validateRestore,
  type BackupView,
  type FabricBackupStatus,
  type RestoreSource,
  type RestoreValidation,
} from './api';
import { codeOf, useErrorText } from './errors';
import { Field } from './Field';
import { RETRY_CODES, RestoreSourceStep, type Mode, type WizardError } from './RestoreSourceStep';

type Step = 'select' | 'preview' | 'running' | 'success' | 'failed';

/** The host reads the upload as JSON (base64, about a third larger) with a 10 MB body limit. */
const MAX_UPLOAD_BYTES = 7 * 1024 * 1024;

/** What is wrong with a file before it is sent, if anything. */
function uploadProblem(file: File): 'empty' | 'tooLarge' | null {
  if (file.size === 0) return 'empty';
  return file.size > MAX_UPLOAD_BYTES ? 'tooLarge' : null;
}

/**
 * Where a failed confirmation leaves the wizard: a missing typed confirmation stays on the preview, an expired or
 * outdated check (or a busy sidecar) goes back to validate again, anything else ends the wizard.
 */
function stepAfterFailure(code: string | null): Step {
  if (code === 'confirmation_required') return 'preview';
  return code !== null && RETRY_CODES.has(code) ? 'select' : 'failed';
}

type Props = Readonly<{
  stored: BackupView[];
  onClose: () => void;
  /** Called with the fresh status once a restore succeeded. */
  onRestored: (status: FabricBackupStatus) => void;
}>;

type PreviewProps = {
  validation: RestoreValidation;
  typed: string;
  onTyped: (value: string) => void;
  error: WizardError | null;
};

/** What the validated backup would do to this installation, with the typed confirmation where it overwrites. */
function PreviewStep({ validation, typed, onTyped, error }: Readonly<PreviewProps>) {
  const { t } = useMatterTranslations();
  const formatDateTime = useDateTimeFormatter({ showSeconds: true });
  const { backup, preflight } = validation;
  return (
    <>
      <div className="mt:flex mt:flex-wrap mt:gap-2">
        <Chip variant="soft">{t(`fabric.restore.kind.${preflight.kind}`)}</Chip>
        <Chip variant="soft">{t(`fabric.state.${preflight.sidecarState}`)}</Chip>
      </div>
      <dl className="mt:grid mt:grid-cols-1 mt:gap-3 mt:sm:grid-cols-2" data-cy="matter-restore-summary">
        <Field label={t('fabric.restore.backupCreated')}>{formatDateTime(backup.createdAt)}</Field>
        <Field label={t('fabric.restore.pluginVersion')}>{backup.pluginVersion}</Field>
        <Field label={t('fabric.restore.sidecarVersion')}>{backup.sidecarVersion}</Field>
        <Field label={t('fabric.generationLabel')}>{backup.fabricGeneration}</Field>
        <Field label={t('fabric.restore.backupFabric')}>{backup.fabricId}</Field>
        <Field label={t('fabric.restore.currentFabric')}>{preflight.currentFabricId ?? t('fabric.none')}</Field>
      </dl>
      <p>
        {t('fabric.restore.previewHint')}
        {preflight.requiresTypedConfirmation && ` ${t('fabric.restore.previewHintBackup')}`}
      </p>
      {!backup.consistent && (
        <StatusAlert
          status="warning"
          title={t('fabric.restore.inconsistentTitle')}
          data-cy="matter-restore-inconsistent"
        >
          {t('fabric.restore.inconsistentText')}
        </StatusAlert>
      )}
      {preflight.requiresTypedConfirmation && (
        <>
          <StatusAlert status="danger" title={t('fabric.restore.overwriteTitle')} data-cy="matter-restore-overwrite">
            {t('fabric.restore.overwriteText')}
          </StatusAlert>
          <TextField value={typed} onChange={onTyped} className="mt:w-full">
            <Label>{t('fabric.restore.typeFabricId', { fabricId: preflight.confirmationFabricId ?? '' })}</Label>
            <Input autoComplete="off" spellCheck={false} data-cy="matter-restore-typed" />
          </TextField>
        </>
      )}
      {error && (
        <StatusAlert status="danger" data-cy="matter-restore-confirm-error">
          {error.text}
        </StatusAlert>
      )}
    </>
  );
}

/** The end of a restore. A failed rollback is the one outcome that leaves the sidecar in an unknown state. */
function ResultStep({ step, error }: Readonly<{ step: 'success' | 'failed'; error: WizardError | null }>) {
  const { t } = useMatterTranslations();
  if (step === 'success') {
    return (
      <StatusAlert status="success" title={t('fabric.restore.successTitle')} data-cy="matter-restore-success">
        {t('fabric.restore.successText')}
      </StatusAlert>
    );
  }
  const rollbackFailed = error?.code === 'rollback_failed';
  return (
    <StatusAlert
      status="danger"
      title={rollbackFailed ? t('fabric.restore.rollbackFailedTitle') : t('fabric.restore.failedTitle')}
      data-cy={rollbackFailed ? 'matter-restore-rollback-failed' : 'matter-restore-failed'}
    >
      {error?.text}
    </StatusAlert>
  );
}

type FooterProps = Readonly<{
  step: Step;
  busy: boolean;
  canValidate: boolean;
  canConfirm: boolean;
  danger: boolean;
  onClose: () => void;
  onValidate: () => void;
  onConfirm: () => void;
}>;

function WizardFooter({ step, busy, canValidate, canConfirm, danger, onClose, onValidate, onConfirm }: FooterProps) {
  const { t } = useMatterTranslations();
  if (step === 'success' || step === 'failed') {
    return (
      <Button onPress={onClose} data-cy="matter-restore-close">
        {t('fabric.close')}
      </Button>
    );
  }
  if (step === 'running') return null;
  return (
    <>
      <Button variant="tertiary" onPress={onClose}>
        {t('fabric.cancel')}
      </Button>
      {step === 'select' ? (
        <Button isDisabled={!canValidate} isPending={busy} onPress={onValidate} data-cy="matter-restore-validate">
          {t('fabric.restore.validate')}
        </Button>
      ) : (
        <Button
          variant={danger ? 'danger' : 'primary'}
          isDisabled={!canConfirm}
          onPress={onConfirm}
          data-cy="matter-restore-confirm"
        >
          {t('fabric.restore.confirm')}
        </Button>
      )}
    </>
  );
}

/**
 * Restore from a stored backup or an uploaded file: validate (no live change), review the preflight, then confirm.
 * A healthy fabric is only overwritten after typing its fabric ID. The recovery key typed here lives in this
 * component's state only and is gone when the wizard closes or the restore ended.
 */
export function RestoreWizard({ stored, onClose, onRestored }: Props) {
  const { t } = useMatterTranslations();
  const errorText = useErrorText();
  const [step, setStep] = useState<Step>('select');
  const [mode, setMode] = useState<Mode>(stored.length > 0 ? 'stored' : 'upload');
  const [backupId, setBackupId] = useState<string | null>(stored[0]?.id ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [error, setError] = useState<WizardError | null>(null);
  const [validation, setValidation] = useState<RestoreValidation | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const preflight = validation?.preflight;
  const confirmed = !preflight?.requiresTypedConfirmation || typed.trim() === preflight.confirmationFabricId;
  const fail = (caught: unknown) => setError({ code: codeOf(caught), text: errorText(caught) });

  const validate = async () => {
    setError(null);
    const problem = mode === 'upload' && file ? uploadProblem(file) : null;
    if (problem) return setError({ code: null, text: t(`fabric.restore.error.${problem}`) });
    setBusy(true);
    try {
      const source: RestoreSource =
        mode === 'stored' && backupId
          ? { type: 'stored', backupId }
          : { type: 'upload', contentBase64: await readFileAsBase64(file as File) };
      setValidation(await validateRestore(source, recoveryKey.trim() || undefined));
      setTyped('');
      setStep('preview');
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!validation) return;
    setError(null);
    setBusy(true);
    setStep('running');
    let next: Step = 'success';
    try {
      const result = await confirmRestore(
        validation.validationId,
        preflight?.requiresTypedConfirmation ? typed.trim() : undefined,
      );
      onRestored(result.status);
    } catch (caught) {
      fail(caught);
      next = stepAfterFailure(codeOf(caught));
    } finally {
      setBusy(false);
    }
    // Back to validating keeps the source and the key; an ended restore forgets the key.
    if (next === 'select') setValidation(null);
    if (next === 'success' || next === 'failed') setRecoveryKey('');
    setStep(next);
  };

  const close = () => {
    if (busy) return;
    if (step === 'preview' && validation) void cancelRestore(validation.validationId).catch(() => undefined);
    setRecoveryKey('');
    onClose();
  };

  return (
    <StandardModal
      isOpen
      data-cy="matter-restore-wizard"
      onOpenChange={(open) => !open && close()}
      size="lg"
      backdropProps={{ isDismissable: false }}
    >
      <ModalHeader>
        <ModalHeading>{t('fabric.restore.title')}</ModalHeading>
      </ModalHeader>
      <ModalBody className="mt:flex mt:flex-col mt:gap-4">
        {step === 'select' && (
          <RestoreSourceStep
            stored={stored}
            mode={mode}
            onMode={setMode}
            backupId={backupId}
            onBackupId={setBackupId}
            onFile={(next) => {
              setFile(next);
              setError(null);
            }}
            recoveryKey={recoveryKey}
            onRecoveryKey={setRecoveryKey}
            error={error}
          />
        )}
        {step === 'preview' && validation && (
          <PreviewStep validation={validation} typed={typed} onTyped={setTyped} error={error} />
        )}
        {step === 'running' && <p role="status">{t('fabric.restore.running')}</p>}
        {(step === 'success' || step === 'failed') && <ResultStep step={step} error={error} />}
      </ModalBody>
      <ModalFooter>
        <WizardFooter
          step={step}
          busy={busy}
          canValidate={!busy && (mode === 'stored' ? backupId !== null : file !== null)}
          canConfirm={confirmed}
          danger={preflight?.requiresTypedConfirmation === true}
          onClose={close}
          onValidate={() => void validate()}
          onConfirm={() => void confirm()}
        />
      </ModalFooter>
    </StandardModal>
  );
}
