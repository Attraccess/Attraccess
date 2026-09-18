import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ThemeToggle as SharedThemeToggle, ThemeToggleProps } from '@attraccess/ui';

export function ThemeToggle(props: Omit<ThemeToggleProps, 'label'>) {
  const { t } = useTranslations({
    en: { label: 'Dark mode' },
    de: { label: 'Dunkler Modus' },
  });
  return <SharedThemeToggle {...props} label={t('label')} />;
}
