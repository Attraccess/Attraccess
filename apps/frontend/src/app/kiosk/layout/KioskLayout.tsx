import { PropsWithChildren } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAutoLogoff } from '../hooks/useAutoLogoff';

// Inactivity countdown shown as a thin bar at the very top of the page that
// drains as the timer runs down and refills on activity (like the attractap UI).
function AutoLogoffBar({ fraction }: { fraction: number }) {
  // ponytail: explicit colors, not heroui tokens — this theme doesn't generate a
  // bare `bg-primary` utility, so a token-based fill renders transparent.
  return (
    <div className="fixed top-0 left-0 right-0 h-1.5 z-50" style={{ backgroundColor: 'rgba(148,163,184,0.25)' }}>
      <div
        className="h-full transition-[width] duration-1000 ease-linear"
        style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%`, backgroundColor: '#2563eb' }}
      />
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

  const { remaining } = useAutoLogoff(autoLogoffSeconds);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-10 p-4">
      {autoLogoffSeconds && remaining !== null && <AutoLogoffBar fraction={remaining / autoLogoffSeconds} />}
      <div className="flex items-center gap-3">
        <img src="/logo.png" alt="Attraccess" className="h-16 w-auto" />
        <span className="text-3xl font-bold">Attraccess</span>
      </div>
      {children}
    </div>
  );
}
