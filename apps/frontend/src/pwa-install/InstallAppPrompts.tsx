import { Alert, Button } from '@heroui/react';
import { Download } from 'lucide-react';
import { StatusDialog, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useInstallPromptStore } from './installPrompt';
import { useInstallApp } from './useInstallApp';
import en from './en.json';
import de from './de.json';

type Translate = ReturnType<typeof useTranslations>['t'];

// A small card at the bottom instead of a full-screen overlay: it never blocks the page and "Not now" snoozes it.
function InstallBanner({ t }: { t: Translate }) {
  const { mode, install } = useInstallApp();
  const isBannerDismissed = useInstallPromptStore((state) => state.isBannerDismissed);
  const dismissBanner = useInstallPromptStore((state) => state.dismissBanner);
  if (!mode || isBannerDismissed) return null;

  // From md up the sidebar (z-50) is part of the page, so the card moves right of it instead of hiding behind it.
  return (
    <section
      aria-label={t('banner.label')}
      className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 sm:right-auto sm:max-w-sm md:[:root:has([data-sidebar=expanded])_&]:left-68 md:[:root:has([data-sidebar=collapsed])_&]:left-20"
      data-cy="install-app-banner"
      data-install-banner
    >
      <Alert status="accent" className="shadow-overlay">
        <Alert.Indicator>
          <Download aria-hidden className="size-5" />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Title>{t('banner.title')}</Alert.Title>
          <Alert.Description>{t('banner.description')}</Alert.Description>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="primary"
              onPress={() => {
                dismissBanner();
                install();
              }}
              data-cy="install-app-banner-install"
            >
              {t('banner.install')}
            </Button>
            <Button size="sm" variant="ghost" onPress={dismissBanner} data-cy="install-app-banner-dismiss">
              {t('banner.dismiss')}
            </Button>
          </div>
        </Alert.Content>
      </Alert>
    </section>
  );
}

function IosInstallDialog({ t }: { t: Translate }) {
  const isOpen = useInstallPromptStore((state) => state.isIosHelpOpen);
  const setIosHelpOpen = useInstallPromptStore((state) => state.setIosHelpOpen);

  return (
    <StatusDialog
      isOpen={isOpen}
      onClose={() => setIosHelpOpen(false)}
      status="info"
      title={t('ios.title')}
      data-cy="install-app-ios-dialog"
    >
      <p>{t('ios.intro')}</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>{t('ios.step1')}</li>
        <li>{t('ios.step2')}</li>
        <li>{t('ios.step3')}</li>
      </ol>
    </StatusDialog>
  );
}

/** The install banner and the iOS how-to dialog. Not rendered in kiosk mode. */
export function InstallAppPrompts() {
  const { t } = useTranslations({ en, de });
  return (
    <>
      <InstallBanner t={t} />
      <IosInstallDialog t={t} />
    </>
  );
}
