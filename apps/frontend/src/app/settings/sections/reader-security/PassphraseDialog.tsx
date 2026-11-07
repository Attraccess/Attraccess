import { Button, StandardModal, useTranslations } from '@attraccess/plugins-frontend-ui';
import { Input, Label, ModalBody, ModalFooter, ModalHeader, ModalHeading, TextField } from '@heroui/react';
import { useState } from 'react';
import { apiErrorMessage } from '../../../attractap/pairing/pairingUtils';
import { MIN_PASSPHRASE_LENGTH } from './saveKeyFile';
import de from './de.json';
import en from './en.json';

interface Props {
  isOpen: boolean;
  /** 'recovery' or 'backup' pick the wording. */
  kind: 'recovery' | 'backup';
  isPending: boolean;
  error?: unknown;
  onClose: () => void;
  onSubmit: (passphrase: string) => void;
}

/** Asks for the passphrase that protects a downloaded key file, twice so a typo cannot lock the key away. */
export function PassphraseDialog({ isOpen, kind, isPending, error, onClose, onSubmit }: Readonly<Props>) {
  const { t } = useTranslations({ en, de });
  const [passphrase, setPassphrase] = useState('');
  const [repeat, setRepeat] = useState('');
  const tooShort = passphrase.length < MIN_PASSPHRASE_LENGTH;
  const mismatch = passphrase !== repeat;

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
            <TextField type="password" value={passphrase} onChange={setPassphrase}>
              <Label>{t('passphrase.label')}</Label>
              <Input autoComplete="new-password" data-cy="reader-security-passphrase" />
            </TextField>
            <TextField type="password" value={repeat} onChange={setRepeat}>
              <Label>{t('passphrase.repeat')}</Label>
              <Input autoComplete="new-password" data-cy="reader-security-passphrase-repeat" />
            </TextField>
            {passphrase && tooShort ? (
              <p className="text-sm text-danger">{t('passphrase.tooShort', { min: MIN_PASSPHRASE_LENGTH })}</p>
            ) : null}
            {repeat && mismatch ? <p className="text-sm text-danger">{t('passphrase.mismatch')}</p> : null}
            {error ? <p className="text-sm text-danger">{apiErrorMessage(error) ?? t('error')}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onPress={close}>
              {t('cancel')}
            </Button>
            <Button
              isDisabled={tooShort || mismatch}
              isPending={isPending}
              onPress={() => onSubmit(passphrase)}
              data-cy="reader-security-passphrase-submit"
            >
              {t(`${kind}.submit`)}
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
