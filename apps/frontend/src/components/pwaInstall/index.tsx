import PWAInstallFromLib from '@khmyznikov/pwa-install/react-legacy';
import de from './de.json';
import en from './en.json';
import { useTranslations } from '@attraccess/plugins-frontend-ui';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    promptEvent: any;
  }
}

export function PWAInstall() {
  const { t } = useTranslations({
    en,
    de,
  });

  return (
    <PWAInstallFromLib
      name="Attraccess"
      description={t('description')}
      icon={'/icon-512-maskable.png'}
    ></PWAInstallFromLib>
  );
}
