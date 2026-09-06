import { useEffect, useState } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { AttraccessLogo } from '@attraccess/ui';

const en = { lockedBy: 'Locked by' };
const de = { lockedBy: 'Gesperrt durch' };

const IDLE_MS = 30_000;
// Same set useAutoLogoff watches; capture:true so non-bubbling scroll events still count as activity.
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'wheel', 'touchstart'] as const;

/**
 * Screensaver for the unauthenticated kiosk login screen. After {@link IDLE_MS} of no input it blanks
 * the screen with neutral "Locked by" copy and the brand-colored Attraccess logo on white.
 * Any input dismisses it and reveals the login form again.
 */
export function KioskScreensaver({ enabled }: { enabled: boolean }) {
  const { t } = useTranslations({ en, de });
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setActive(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setActive(true), IDLE_MS);
    };
    const onActivity = () => {
      setActive(false);
      arm();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true, capture: true }));
    arm();
    return () => {
      clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity, { capture: true }));
    };
  }, [enabled]);

  if (!active) return null;

  // Topmost; preventDefault on the waking tap so it only dismisses the saver instead of also pressing
  // a button on the login form underneath. The window listeners above clear `active` and re-arm.
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-white text-accent"
      onPointerDown={(e) => e.preventDefault()}
    >
      <span className="text-sm tracking-wide text-zinc-600">{t('lockedBy')}</span>
      <AttraccessLogo className="w-[38vw] max-w-[520px]" />
    </div>
  );
}
