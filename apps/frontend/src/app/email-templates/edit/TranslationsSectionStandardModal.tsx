import { Input, ModalBody, ModalFooter, ModalHeader, ModalHeading, TextField } from '@heroui/react';
import { Button } from '../../../components/button';
import { StandardModal } from '../../../components/standardModal';
import { LOCALE_PATTERN } from './TranslationsSection.state';
import { useTranslationsSectionState } from './useTranslationsSectionState';
type Props = Pick<
  ReturnType<typeof useTranslationsSectionState>,
  'customLocaleOpen' | 'setCustomLocaleOpen' | 'customLocale' | 'handleAddLanguage' | 't' | 'setCustomLocale'
>;
export function TranslationsSectionStandardModal({
  customLocaleOpen,
  setCustomLocaleOpen,
  customLocale,
  handleAddLanguage,
  t,
  setCustomLocale,
}: Props) {
  return (
    <StandardModal isOpen={customLocaleOpen} onOpenChange={setCustomLocaleOpen} size="sm">
      {({ close }) => {
        const trimmed = customLocale.trim();
        const isValid = LOCALE_PATTERN.test(trimmed);
        const addCustomLocale = () => {
          if (!isValid) return;
          handleAddLanguage(trimmed);
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
