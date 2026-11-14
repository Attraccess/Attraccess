import { PasswordInput, StatusAlert, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import { Description, Label, Radio, RadioGroup } from '@heroui/react';
import { useMatterTranslations } from '../i18n';
import type { BackupView } from './api';
import { useFormatSize } from './useFormatSize';

export type Mode = 'stored' | 'upload';
export type WizardError = { code: string | null; text: string };

/** Codes after which the backup has to be validated again: the wizard returns here with source and key kept. */
export const RETRY_CODES = new Set(['validation_expired', 'preflight_changed', 'busy']);
const KEY_CODES = new Set(['key_required', 'wrong_key']);

type Props = Readonly<{
  stored: BackupView[];
  mode: Mode;
  onMode: (mode: Mode) => void;
  backupId: string | null;
  onBackupId: (id: string) => void;
  onFile: (file: File | null) => void;
  recoveryKey: string;
  onRecoveryKey: (value: string) => void;
  error: WizardError | null;
}>;

function RadioOption({ value, label, description, isDisabled }: Readonly<RadioOptionProps>) {
  return (
    <Radio value={value} isDisabled={isDisabled} data-cy={`matter-restore-option-${value}`}>
      <Radio.Content>
        <Radio.Control>
          <Radio.Indicator />
        </Radio.Control>
        <Label>{label}</Label>
      </Radio.Content>
      <Description>{description}</Description>
    </Radio>
  );
}
type RadioOptionProps = { value: string; label: React.ReactNode; description: string; isDisabled?: boolean };

function StoredBackups({ stored, backupId, onBackupId }: Pick<Props, 'stored' | 'backupId' | 'onBackupId'>) {
  const { t } = useMatterTranslations();
  const formatDateTime = useDateTimeFormatter({ showSeconds: true });
  const formatSize = useFormatSize();
  return (
    <RadioGroup value={backupId ?? ''} onChange={onBackupId} data-cy="matter-restore-stored">
      <Label>{t('fabric.backups.stored')}</Label>
      {stored.map((backup) => (
        <RadioOption
          key={backup.id}
          value={backup.id}
          label={formatDateTime(backup.createdAt)}
          description={`${t(`fabric.trigger.${backup.trigger}`)} · ${t('fabric.generation', { generation: backup.fabricGeneration })} · ${formatSize(backup.sizeBytes)}`}
        />
      ))}
    </RadioGroup>
  );
}

/** Pick a stored backup or upload a file, and give the recovery key when the backup needs another one. */
export function RestoreSourceStep(props: Props) {
  const { stored, mode, error, recoveryKey } = props;
  const { t } = useMatterTranslations();
  const showKey = (error?.code != null && KEY_CODES.has(error.code)) || recoveryKey !== '';
  const retry = error?.code != null && RETRY_CODES.has(error.code);
  return (
    <>
      <p>{t('fabric.restore.intro')}</p>
      <RadioGroup value={mode} onChange={(value) => props.onMode(value as Mode)} data-cy="matter-restore-source">
        <Label>{t('fabric.restore.source')}</Label>
        <RadioOption
          value="stored"
          label={t('fabric.restore.fromStored')}
          description={t('fabric.restore.fromStoredHint')}
          isDisabled={stored.length === 0}
        />
        <RadioOption
          value="upload"
          label={t('fabric.restore.fromUpload')}
          description={t('fabric.restore.fromUploadHint')}
        />
      </RadioGroup>
      {mode === 'stored' ? (
        <StoredBackups stored={stored} backupId={props.backupId} onBackupId={props.onBackupId} />
      ) : (
        <label className="mt:flex mt:flex-col mt:gap-1 mt:text-sm">
          {t('fabric.restore.file')}
          <input
            type="file"
            accept=".attraccess-matter-backup,application/octet-stream"
            className="mt:block mt:w-full mt:cursor-pointer mt:text-sm mt:file:mr-3 mt:file:cursor-pointer mt:file:rounded-lg mt:file:border-0 mt:file:bg-default mt:file:px-3 mt:file:py-1.5 mt:file:text-sm mt:file:font-medium mt:file:text-foreground"
            onChange={(event) => props.onFile(event.target.files?.[0] ?? null)}
            data-cy="matter-restore-file"
          />
        </label>
      )}
      {showKey && (
        <PasswordInput
          label={t('fabric.restore.recoveryKey')}
          description={t('fabric.restore.recoveryKeyHint')}
          autoComplete="off"
          value={recoveryKey}
          onValueChange={props.onRecoveryKey}
          data-cy="matter-restore-key"
        />
      )}
      {error && (
        <StatusAlert
          status={retry ? 'warning' : 'danger'}
          title={retry ? t('fabric.restore.retryTitle') : t('fabric.restore.validationFailed')}
          data-cy="matter-restore-error"
        >
          {error.text}
        </StatusAlert>
      )}
    </>
  );
}
