import { Input, ModalBody, ModalFooter, ModalHeader, ModalHeading, TextField } from '@heroui/react';
import { Button, StandardModal, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useState } from 'react';
import de from './de.json';
import en from './en.json';
import { LOCALE_PATTERN } from './translationLocales';

interface CustomLocaleModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onAdd: (locale: string) => void;
}

/** Lets the user add a language that is not in the curated dropdown, validated like the backend does. */
export function CustomLocaleModal({ isOpen, onOpenChange, onAdd }: Readonly<CustomLocaleModalProps>) {
  const { t } = useTranslations({ en, de });
  const [customLocale, setCustomLocale] = useState('');
  const [wasOpen, setWasOpen] = useState(isOpen);

  // Reset on the open transition during render, not in an effect: an effect runs after the first
  // open frame has painted, which would show the previous entry for that frame.
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setCustomLocale('');
  }

  return (
    <StandardModal isOpen={isOpen} onOpenChange={onOpenChange} size="sm">
      {({ close }) => {
        const trimmed = customLocale.trim();
        const isValid = LOCALE_PATTERN.test(trimmed);
        const addCustomLocale = () => {
          if (!isValid) return;
          onAdd(trimmed);
          close();
        };
        return (
          <>
            <ModalHeader>
              <ModalHeading>{t('translations.customLocaleTitle')}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <div className="flex flex-col gap-2">
                <p className="text-sm text-default-500">{t('translations.customLocaleHint')}</p>
                <TextField
                  value={customLocale}
                  onChange={setCustomLocale}
                  isInvalid={trimmed !== '' && !isValid}
                  aria-label={t('translations.customLocaleTitle')}
                >
                  <Input
                    placeholder="de-CH"
                    data-cy="translations-custom-locale-input"
                    onKeyDown={(e) => e.key === 'Enter' && addCustomLocale()}
                  />
                </TextField>
                {trimmed !== '' && !isValid && (
                  <p className="text-xs text-danger">{t('translations.customLocaleInvalid')}</p>
                )}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={close}>
                {t('actions.cancel')}
              </Button>
              <Button
                variant="primary"
                isDisabled={!isValid}
                onPress={addCustomLocale}
                data-cy="translations-custom-locale-add"
              >
                {t('translations.customLocaleAdd')}
              </Button>
            </ModalFooter>
          </>
        );
      }}
    </StandardModal>
  );
}
