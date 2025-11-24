import PWAInstallFromLib from '@khmyznikov/pwa-install/react-legacy';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    promptEvent: any;
  }
}

export default function PWAInstallProduction() {
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

