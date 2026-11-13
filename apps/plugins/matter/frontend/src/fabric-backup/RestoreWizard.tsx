import {
  Button,
  PasswordInput,
  StandardModal,
  StatusAlert,
  useDateTimeFormatter,
} from '@attraccess/plugins-frontend-ui';
import { Chip, Input, Label, ModalBody, ModalFooter, ModalHeader, ModalHeading, TextField } from '@heroui/react';
import { useState } from 'react';
import { useMatterTranslations } from '../i18n';
import {
  FabricApiError,
  RESTORE_VALIDATION_CODES,
  cancelRestore,
  confirmRestore,
  readFileAsBase64,
  validateRestore,
  type BackupView,
  type FabricBackupStatus,
  type RestoreSource,
  type RestoreValidation,
} from './api';

type Step = 'select' | 'preview' | 'running' | 'success' | 'failed';
type Mode = 'stored' | 'upload';

type Props = Readonly<{
  stored: BackupView[];
  onClose: () => void;
  /** Called with the fresh status once a restore succeeded. */
  onRestored: (status: FabricBackupStatus) => void;
}>;

const KEY_CODES = new Set(['key_required', 'wrong_key']);

/** The administrator-facing explanation of a failed validation or restore. */
function useErrorText() {
  const { t } = useMatterTranslations();
  return (error: unknown): string => {
    if (error instanceof FabricApiError && error.code) {
      if ((RESTORE_VALIDATION_CODES as readonly string[]).includes(error.code))
        return t(`fabric.restore.error.${error.code}`);
      if (error.code === 'confirmation_required') return t('fabric.restore.error.confirmation_required');
    }
    return error instanceof Error ? error.message : String(error);
  };
}

/**
 * Restore from a stored backup or an uploaded file: validate (no live change), review the preflight, then confirm.
 * A healthy fabric is only overwritten after typing its fabric ID. The recovery key typed here lives in this
 * component's state only and is gone when the wizard closes.
 */
export function RestoreWizard({ stored, onClose, onRestored }: Props) {
  const { t } = useMatterTranslations();
  const errorText = useErrorText();
  const formatDateTime = useDateTimeFormatter({ showSeconds: true });
  const [step, setStep] = useState<Step>('select');
  const [mode, setMode] = useState<Mode>(stored.length > 0 ? 'stored' : 'upload');
  const [backupId, setBackupId] = useState<string | null>(stored[0]?.id ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [error, setError] = useState<{ code: string | null; text: string } | null>(null);
  const [validation, setValidation] = useState<RestoreValidation | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const needsKey = error?.code != null && KEY_CODES.has(error.code);
  const canValidate = !busy && (mode === 'stored' ? backupId !== null : file !== null);
  const preflight = validation?.preflight;
  const confirmed = !preflight?.requiresTypedConfirmation || typed.trim() === preflight.confirmationFabricId;

  const validate = async () => {
    setBusy(true);
    setError(null);
    try {
      const source: RestoreSource =
        mode === 'stored' && backupId
          ? { type: 'stored', backupId }
          : { type: 'upload', contentBase64: await readFileAsBase64(file as File) };
      setValidation(await validateRestore(source, recoveryKey.trim() || undefined));
      setTyped('');
      setStep('preview');
    } catch (caught) {
      setError({ code: caught instanceof FabricApiError ? caught.code : null, text: errorText(caught) });
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!validation) return;
    setBusy(true);
    setStep('running');
    try {
      const result = await confirmRestore(
        validation.validationId,
        preflight?.requiresTypedConfirmation ? typed.trim() : undefined,
      );
      onRestored(result.status);
      setStep('success');
    } catch (caught) {
      setError({ code: caught instanceof FabricApiError ? caught.code : null, text: errorText(caught) });
      setStep('failed');
    } finally {
      setBusy(false);
      setRecoveryKey('');
    }
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
          <>
            <p>{t('fabric.restore.intro')}</p>
            <div className="mt:flex mt:flex-wrap mt:gap-2" role="group" aria-label={t('fabric.restore.source')}>
              <Button
                variant={mode === 'stored' ? 'primary' : 'secondary'}
                aria-pressed={mode === 'stored'}
                isDisabled={stored.length === 0}
                onPress={() => setMode('stored')}
              >
                {t('fabric.restore.fromStored')}
              </Button>
              <Button
                variant={mode === 'upload' ? 'primary' : 'secondary'}
                aria-pressed={mode === 'upload'}
                onPress={() => setMode('upload')}
              >
                {t('fabric.restore.fromUpload')}
              </Button>
            </div>
            {mode === 'stored' ? (
              <ul className="mt:flex mt:flex-col mt:gap-2" aria-label={t('fabric.restore.fromStored')}>
                {stored.map((backup) => (
                  <li key={backup.id}>
                    <Button
                      variant={backup.id === backupId ? 'primary' : 'tertiary'}
                      aria-pressed={backup.id === backupId}
                      onPress={() => setBackupId(backup.id)}
                      className="mt:w-full mt:justify-start"
                    >
                      {formatDateTime(backup.createdAt)} · {t(`fabric.trigger.${backup.trigger}`)} ·{' '}
                      {t('fabric.generation', { generation: backup.fabricGeneration })}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt:flex mt:flex-col mt:gap-1">
                <label htmlFor="matter-restore-file" className="mt:text-sm">
                  {t('fabric.restore.file')}
                </label>
                <input
                  id="matter-restore-file"
                  type="file"
                  accept=".attraccess-matter-backup,application/octet-stream"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                    setError(null);
                  }}
                  data-cy="matter-restore-file"
                />
              </div>
            )}
            {(needsKey || recoveryKey !== '') && (
              <PasswordInput
                label={t('fabric.restore.recoveryKey')}
                description={t('fabric.restore.recoveryKeyHint')}
                autoComplete="off"
                value={recoveryKey}
                onValueChange={setRecoveryKey}
                data-cy="matter-restore-key"
              />
            )}
            {error && (
              <StatusAlert status="danger" title={t('fabric.restore.validationFailed')} data-cy="matter-restore-error">
                {error.text}
              </StatusAlert>
            )}
          </>
        )}

        {step === 'preview' && validation && preflight && (
          <>
            <div className="mt:flex mt:flex-wrap mt:gap-2">
              <Chip variant="soft">{t(`fabric.restore.kind.${preflight.kind}`)}</Chip>
              <Chip variant="soft">{t(`fabric.state.${preflight.sidecarState}`)}</Chip>
            </div>
            <dl className="mt:grid mt:grid-cols-1 mt:gap-3 mt:sm:grid-cols-2" data-cy="matter-restore-summary">
              <Fact label={t('fabric.restore.backupCreated')}>{formatDateTime(validation.backup.createdAt)}</Fact>
              <Fact label={t('fabric.restore.pluginVersion')}>{validation.backup.pluginVersion}</Fact>
              <Fact label={t('fabric.restore.sidecarVersion')}>{validation.backup.sidecarVersion}</Fact>
              <Fact label={t('fabric.generationLabel')}>{validation.backup.fabricGeneration}</Fact>
              <Fact label={t('fabric.restore.backupFabric')}>{validation.backup.fabricId}</Fact>
              <Fact label={t('fabric.restore.currentFabric')}>{preflight.currentFabricId ?? t('fabric.none')}</Fact>
            </dl>
            <p>{t('fabric.restore.previewHint')}</p>
            {preflight.requiresTypedConfirmation && (
              <>
                <StatusAlert
                  status="danger"
                  title={t('fabric.restore.overwriteTitle')}
                  data-cy="matter-restore-overwrite"
                >
                  {t('fabric.restore.overwriteText')}
                </StatusAlert>
                <TextField value={typed} onChange={setTyped} className="mt:w-full">
                  <Label>{t('fabric.restore.typeFabricId', { fabricId: preflight.confirmationFabricId ?? '' })}</Label>
                  <Input autoComplete="off" spellCheck={false} data-cy="matter-restore-typed" />
                </TextField>
              </>
            )}
          </>
        )}

        {step === 'running' && <p role="status">{t('fabric.restore.running')}</p>}

        {step === 'success' && (
          <StatusAlert status="success" title={t('fabric.restore.successTitle')} data-cy="matter-restore-success">
            {t('fabric.restore.successText')}
          </StatusAlert>
        )}

        {step === 'failed' && (
          <StatusAlert status="danger" title={t('fabric.restore.failedTitle')} data-cy="matter-restore-failed">
            {t('fabric.restore.unchanged')}
            {error && <span className="mt:mt-1 mt:block mt:text-sm">{error.text}</span>}
          </StatusAlert>
        )}
      </ModalBody>
      <ModalFooter>
        {step === 'select' && (
          <>
            <Button variant="tertiary" onPress={close}>
              {t('fabric.cancel')}
            </Button>
            <Button
              isDisabled={!canValidate}
              isPending={busy}
              onPress={() => void validate()}
              data-cy="matter-restore-validate"
            >
              {t('fabric.restore.validate')}
            </Button>
          </>
        )}
        {step === 'preview' && (
          <>
            <Button variant="tertiary" onPress={close}>
              {t('fabric.cancel')}
            </Button>
            <Button
              variant={preflight?.requiresTypedConfirmation ? 'danger' : 'primary'}
              isDisabled={!confirmed}
              onPress={() => void confirm()}
              data-cy="matter-restore-confirm"
            >
              {t('fabric.restore.confirm')}
            </Button>
          </>
        )}
        {(step === 'success' || step === 'failed') && (
          <Button onPress={close} data-cy="matter-restore-close">
            {t('fabric.close')}
          </Button>
        )}
      </ModalFooter>
    </StandardModal>
  );
}

function Fact({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="mt:flex mt:flex-col">
      <dt className="mt:text-xs mt:text-muted">{label}</dt>
      <dd className="mt:break-all">{children}</dd>
    </div>
  );
}
