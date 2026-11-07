import { Button, StandardModal, useTranslations } from '@attraccess/plugins-frontend-ui';
import { Input, Label, ModalBody, ModalFooter, ModalHeader, ModalHeading, TextField } from '@heroui/react';
import { useState } from 'react';
import { apiErrorMessage } from '../../../attractap/pairing/pairingUtils';
import de from './de.json';
import en from './en.json';

interface Props {
  isOpen: boolean;
  /** 'check' proves the recovery file; 'restore' brings back keys from a backup or the recovery file. */
  kind: 'check' | 'restore';
  isPending: boolean;
  error?: unknown;
  onClose: () => void;
  onSubmit: (input: { pem: string; passphrase: string; source: 'signing-backup' | 'recovery-file' }) => void;
}

/** Upload a key file and give its passphrase. The file never leaves the browser except in the request. */
export function KeyFileDialog({ isOpen, kind, isPending, error, onClose, onSubmit }: Readonly<Props>) {
  const { t } = useTranslations({ en, de });
  const [pem, setPem] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [source, setSource] = useState<'signing-backup' | 'recovery-file'>('signing-backup');

  const readFile = async (file: File | undefined) => setPem(file ? await file.text() : '');

  return (
    <StandardModal
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      data-cy={`reader-security-${kind}-dialog`}
    >
      {({ close }) => (
        <>
          <ModalHeader>
            <ModalHeading>{t(`${kind}.title`)}</ModalHeading>
          </ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            <p className="text-sm text-muted">{t(`${kind}.description`)}</p>
            {kind === 'restore' ? (
              <fieldset className="flex flex-col gap-1 text-sm">
                {(['signing-backup', 'recovery-file'] as const).map((value) => (
                  <label key={value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="restore-source"
                      checked={source === value}
                      onChange={() => setSource(value)}
                    />
                    {t(`restore.source.${value}`)}
                  </label>
                ))}
              </fieldset>
            ) : null}
            <label className="flex flex-col gap-1 text-sm">
              {t('file.label')}
              <input
                type="file"
                accept=".pem,.key,text/plain"
                onChange={(event) => void readFile(event.target.files?.[0])}
                data-cy="reader-security-key-file"
              />
            </label>
            <TextField type="password" value={passphrase} onChange={setPassphrase}>
              <Label>{t('passphrase.label')}</Label>
              <Input autoComplete="off" data-cy="reader-security-file-passphrase" />
            </TextField>
            {error ? <p className="text-sm text-danger">{apiErrorMessage(error) ?? t('error')}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onPress={close}>
              {t('cancel')}
            </Button>
            <Button
              isDisabled={!pem || !passphrase}
              isPending={isPending}
              onPress={() => onSubmit({ pem, passphrase, source })}
              data-cy="reader-security-file-submit"
            >
              {t(`${kind}.submit`)}
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
