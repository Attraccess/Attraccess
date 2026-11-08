import { Button, StandardModal, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Input,
  Label,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Radio,
  RadioGroup,
  TextField,
} from '@heroui/react';
import { useState } from 'react';
import { apiErrorMessage } from '../../../attractap/pairing/pairingUtils';
import de from './de.json';
import en from './en.json';

const SOURCES = ['signing-backup', 'recovery-file'] as const;
type Source = (typeof SOURCES)[number];

interface Props {
  isOpen: boolean;
  /** 'check' proves the recovery file; 'restore' brings back keys from a backup or the recovery file. */
  kind: 'check' | 'restore';
  isPending: boolean;
  error?: unknown;
  onClose: () => void;
  onSubmit: (input: { pem: string; passphrase: string; source: Source }) => void;
}

/** Upload a key file and give its passphrase. The file never leaves the browser except in the request. */
export function KeyFileDialog({ isOpen, kind, isPending, error, onClose, onSubmit }: Readonly<Props>) {
  const { t } = useTranslations({ en, de });
  const [pem, setPem] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [source, setSource] = useState<Source>('signing-backup');

  const readFile = async (file: File | undefined) => setPem(file ? await file.text() : '');

  return (
    <StandardModal
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      data-cy={`reader-security-${kind}-dialog`}
    >
      {({ close }) => (
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            if (pem && passphrase && !isPending) onSubmit({ pem, passphrase, source });
          }}
        >
          <ModalHeader>
            <ModalHeading>{t(`${kind}.title`)}</ModalHeading>
          </ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            <p className="text-sm text-muted">{t(`${kind}.description`)}</p>
            {kind === 'restore' ? (
              <RadioGroup
                value={source}
                onChange={(value) => setSource(value as Source)}
                data-cy="reader-security-source"
              >
                <Label className="sr-only">{t('restore.title')}</Label>
                {SOURCES.map((value) => (
                  <Radio key={value} value={value} data-cy={`reader-security-source-${value}`}>
                    <Radio.Content>
                      <Radio.Control>
                        <Radio.Indicator />
                      </Radio.Control>
                      <Label>{t(`restore.source.${value}`)}</Label>
                    </Radio.Content>
                  </Radio>
                ))}
              </RadioGroup>
            ) : null}
            <label className="flex flex-col gap-1 text-sm">
              {t('file.label')}
              <input
                type="file"
                accept=".pem,.key,text/plain"
                className="block w-full cursor-pointer text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-default file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
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
              type="submit"
              isDisabled={!pem || !passphrase}
              isPending={isPending}
              data-cy="reader-security-file-submit"
            >
              {t(`${kind}.submit`)}
            </Button>
          </ModalFooter>
        </form>
      )}
    </StandardModal>
  );
}
