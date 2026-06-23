import { PropsWithChildren } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAutoLogoff } from '../hooks/useAutoLogoff';

function AutoLogoffBanner({ remaining }: { remaining: number }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-warning/90 text-warning-foreground text-center p-4 text-lg font-medium">
      Signing out in {remaining} second{remaining !== 1 ? 's' : ''} due to inactivity. Touch anywhere to stay signed in.
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
