import { Dropdown, DropdownItem, DropdownMenu, DropdownPopover, DropdownTrigger } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Plus } from 'lucide-react';
import de from './de.json';
import en from './en.json';
import { useLocaleDisplayName } from './useLocaleDisplayName';

interface AddLanguageDropdownProps {
  availableLocales: string[];
  onAddLanguage: (locale: string) => void;
  onAddCustomLanguage: () => void;
}

export function AddLanguageDropdown({
  availableLocales,
  onAddLanguage,
  onAddCustomLanguage,
}: Readonly<AddLanguageDropdownProps>) {
  const { t } = useTranslations({ en, de });
  const displayName = useLocaleDisplayName();
  return (
    <Dropdown>
      <DropdownTrigger
        className={`${buttonVariants({ variant: 'primary', size: 'sm' })} inline-flex items-center gap-2`}
        aria-label={t('translations.addLanguage')}
        data-cy="translations-add-language-button"
      >
        <Plus size={16} />
        {t('translations.addLanguage')}
      </DropdownTrigger>
      <DropdownPopover className="max-h-72 overflow-y-auto">
        <DropdownMenu aria-label={t('translations.addLanguage')}>
          {[
            ...availableLocales.map((locale) => (
              <DropdownItem
                key={locale}
                id={locale}
                onPress={() => onAddLanguage(locale)}
                data-cy={`translations-add-language-${locale}`}
              >
                {displayName(locale)}
                <span className="ml-2 text-xs text-default-400 uppercase">{locale}</span>
              </DropdownItem>
            )),
            <DropdownItem
              key="__custom"
              id="__custom"
              onPress={onAddCustomLanguage}
              data-cy="translations-add-language-custom"
            >
              {t('translations.customLocale')}
            </DropdownItem>,
          ]}
        </DropdownMenu>
      </DropdownPopover>
    </Dropdown>
  );
}
