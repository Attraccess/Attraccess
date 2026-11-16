import { Button, PasswordInput, StandardModal, StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import { ModalBody, ModalFooter, ModalHeader, ModalHeading } from '@heroui/react';
import { useState } from 'react';
import { apiErrorMessage } from '../../../attractap/pairing/pairingUtils';
import { MIN_PASSPHRASE_LENGTH } from './constants';
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
  const showMismatch = repeat !== '' && mismatch;

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
            if (!tooShort && !mismatch && !isPending) onSubmit(passphrase);
          }}
        >
          <ModalHeader>
            <ModalHeading>{t(`${kind}.title`)}</ModalHeading>
          </ModalHeader>
          <ModalBody className="flex flex-col gap-3">
            <p className="text-sm text-muted">{t(`${kind}.description`)}</p>
            <PasswordInput
              label={t('passphrase.label')}
              description={t('passphrase.minLength', { min: MIN_PASSPHRASE_LENGTH })}
              value={passphrase}
              onChange={setPassphrase}
              autoComplete="new-password"
              data-cy="reader-security-passphrase"
            />
            <PasswordInput
              label={t('passphrase.repeat')}
              value={repeat}
              onChange={setRepeat}
              isInvalid={showMismatch}
              errorMessage={showMismatch ? t('passphrase.mismatch') : undefined}
              autoComplete="new-password"
              data-cy="reader-security-passphrase-repeat"
            />
            {error ? (
              <StatusAlert status="danger" data-cy="reader-security-dialog-error">
                {apiErrorMessage(error) ?? t('error')}
              </StatusAlert>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onPress={close} isDisabled={isPending}>
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              isDisabled={tooShort || mismatch}
              isPending={isPending}
              data-cy="reader-security-passphrase-submit"
            >
              {t(`${kind}.submit`)}
            </Button>
          </ModalFooter>
        </form>
      )}
    </StandardModal>
  );
}
