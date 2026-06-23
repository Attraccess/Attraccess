import { PropsWithChildren } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAutoLogoff } from '../hooks/useAutoLogoff';
import en from './KioskLayout.en.json';
import de from './KioskLayout.de.json';

function AutoLogoffBanner({ remaining }: { remaining: number }) {
  const { t } = useTranslations({ en, de });
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-warning/90 text-warning-foreground text-center p-4 text-lg font-medium">
      {t('autoLogoff.banner', { count: remaining })}
    </div>
  );
}

export function KioskLayout({ children }: PropsWithChildren) {
  const [params] = useSearchParams();
  const autoLogoffSeconds = (() => {
    const v = params.get('autoLogoff');
    const n = v ? parseInt(v, 10) : null;
    return n && n > 0 ? n : null;
  })();

  const { remaining, isWarning } = useAutoLogoff(autoLogoffSeconds);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      {children}
      {isWarning && remaining !== null && <AutoLogoffBanner remaining={remaining} />}
    </div>
  );
}
