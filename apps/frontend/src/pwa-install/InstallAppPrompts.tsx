import { useId } from 'react';
import { Alert, Button } from '@heroui/react';
import { Download } from 'lucide-react';
import { StatusDialog, useTranslations } from '@attraccess/plugins-frontend-ui';
import { usePwaUpdateStore } from '../pwa-update/updateController';
import { useInstallPromptStore } from './installPrompt';
import { useInstallApp } from './useInstallApp';
import en from './en.json';
import de from './de.json';

// A small card at the bottom instead of a full-screen overlay: it never blocks the page and "Not now" snoozes it.
function InstallBanner() {
  const { t } = useTranslations({ en, de });
  const { mode, install } = useInstallApp();
  const isBannerDismissed = useInstallPromptStore((state) => state.isBannerDismissed);
  const dismissBanner = useInstallPromptStore((state) => state.dismissBanner);
  // On phones the full-width card shares the bottom edge with the update indicator; the update matters more, so
  // the card waits for it there. Wider screens have room for both.
  const isUpdating = usePwaUpdateStore((state) => state.status !== 'idle');
  const titleId = useId();
  if (!mode || isBannerDismissed) return null;

  // From md up the sidebar (z-50) is part of the page, so the card moves right of it instead of hiding behind it.
  return (
    <section
      aria-labelledby={titleId}
      className={`fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 sm:right-auto sm:max-w-sm md:[:root:has([data-sidebar=expanded])_&]:left-68 md:[:root:has([data-sidebar=collapsed])_&]:left-20${isUpdating ? ' max-sm:hidden' : ''}`}
      data-cy="install-app-banner"
      data-install-banner
    >
      <Alert status="accent" className="shadow-overlay">
        <Alert.Indicator>
          <Download aria-hidden className="size-5" />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Title id={titleId}>{t('banner.title')}</Alert.Title>
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
              {mode === 'ios' ? t('banner.showHow') : t('banner.install')}
            </Button>
            <Button size="sm" variant="secondary" onPress={dismissBanner} data-cy="install-app-banner-dismiss">
              {t('banner.dismiss')}
            </Button>
          </div>
        </Alert.Content>
      </Alert>
    </section>
  );
}

function IosInstallDialog() {
  const { t } = useTranslations({ en, de });
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
  return (
    <>
      <InstallBanner />
      <IosInstallDialog />
    </>
  );
}
