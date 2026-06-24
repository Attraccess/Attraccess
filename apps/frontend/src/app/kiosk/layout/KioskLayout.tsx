import { PropsWithChildren } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, AlertContent, AlertDescription } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAutoLogoff } from '../hooks/useAutoLogoff';
import en from './KioskLayout.en.json';
import de from './KioskLayout.de.json';

function AutoLogoffBanner({ remaining }: { remaining: number }) {
  const { t } = useTranslations({ en, de });
  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      <Alert status="warning">
        <AlertContent>
          <AlertDescription>{t('autoLogoff.banner', { count: remaining })}</AlertDescription>
        </AlertContent>
      </Alert>
    </div>
  );
}

export function KioskLayout({ children }: PropsWithChildren) {
  const [params] = useSearchParams();
  const autoLogoffSeconds = (() => {
    const raw = params.get('autoLogoff');
    const parsed = raw ? parseInt(raw, 10) : null;
    return parsed && parsed > 0 ? parsed : null;
  })();

  const { remaining, isWarning } = useAutoLogoff(autoLogoffSeconds);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-10 p-4">
      {isWarning && remaining !== null && <AutoLogoffBanner remaining={remaining} />}
      <div className="flex items-center gap-3">
        <img src="/logo.png" alt="Attraccess" className="h-16 w-auto" />
        <span className="text-3xl font-bold">Attraccess</span>
      </div>
      {children}
    </div>
  );
}
