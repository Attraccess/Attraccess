import { PropsWithChildren } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LogOutIcon } from 'lucide-react';
import { Button, ProgressBar, Spinner } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { AttraccessLogo } from '@attraccess/ui';
import { useAutoLogoff } from '../hooks/useAutoLogoff';
import { KioskScreensaver } from '../KioskScreensaver';
import { useAuth } from '../../../hooks/useAuth';
import { ThemeToggle } from '../../../components/themeToggle';

const en = { signOut: 'Sign out' };
const de = { signOut: 'Abmelden' };

// Inactivity countdown shown as a thin bar at the very top of the page that
// drains as the timer runs down and refills on activity (like the attractap UI).
function AutoLogoffBar({ fraction }: { fraction: number }) {
  return (
    <ProgressBar
      aria-label="Auto sign-out countdown"
      value={Math.max(0, Math.min(1, fraction)) * 100}
      color="danger"
      // gap-0: drop the grid gap left by the (absent) label row so the bar sits flush at top.
      className="fixed top-0 left-0 right-0 z-50 gap-0"
    >
      <ProgressBar.Track className="rounded-none">
        {/* duration-1000 linear matches the 1s tick so the fill drains continuously, not in jumps. */}
        <ProgressBar.Fill className="rounded-none transition-[width] duration-1000 ease-linear" />
      </ProgressBar.Track>
    </ProgressBar>
  );
}

export function KioskLayout({ children }: PropsWithChildren) {
  const [params] = useSearchParams();
  const autoLogoffSeconds = (() => {
    const raw = params.get('autoLogoff');
    const parsed = raw ? parseInt(raw, 10) : null;
    return parsed && parsed > 0 ? parsed : null;
  })();

  // Only count down once a user is signed in — there's no session to end on the
  // login screen, so the bar must not run there.
  const {
    isAuthenticated,
    logout,
    logoutEverywhere,
    logoutPending,
    canLogoutEverywhere,
    logoutUnavailableReason,
    logoutEverywhereLabel,
    logoutPendingLabel,
    logoutProviderNotice,
  } = useAuth();
  const { t } = useTranslations({ en, de });
  const { remaining } = useAutoLogoff(isAuthenticated ? autoLogoffSeconds : null);

  return (
    // #root is overflow:hidden (app-shell scroll strategy), so the kiosk needs
    // its own scroll container — otherwise content taller than the viewport
    // (e.g. the windowed resource panel) is clipped with nowhere to scroll.
    // The sticky header reserves its own height so wrapped logout controls
    // cannot overlap longer resource pages. The content centers in the remaining space.
    <div className="h-screen overflow-y-auto bg-background">
      {/* Blanks the login screen after inactivity; auto-logoff covers the authenticated case. */}
      <KioskScreensaver enabled={!isAuthenticated && !logoutPending} />
      <div className="min-h-screen flex flex-col">
        {autoLogoffSeconds && remaining !== null && <AutoLogoffBar fraction={remaining / autoLogoffSeconds} />}
        {(isAuthenticated || logoutPending) && (
          <div className="sticky top-0 z-40 flex items-start justify-between gap-4 bg-background p-3">
            <div className="flex min-w-0 flex-col gap-1 max-w-[65vw]">
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" isDisabled={logoutPending} onPress={logout}>
                  <LogOutIcon className="w-4 h-4" />
                  {logoutPending ? logoutPendingLabel : t('signOut')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  isDisabled={logoutPending || !canLogoutEverywhere}
                  onPress={logoutEverywhere}
                  aria-describedby="kiosk-central-logout-hint"
                >
                  <LogOutIcon className="w-4 h-4" />
                  {logoutEverywhereLabel}
                </Button>
              </div>
              <p id="kiosk-central-logout-hint" className="text-xs text-muted">
                {canLogoutEverywhere ? logoutProviderNotice : logoutUnavailableReason}
              </p>
            </div>
            <ThemeToggle />
          </div>
        )}
        <div className="flex flex-1 flex-col items-center justify-center gap-10 p-4">
          <div className="flex items-center">
            <AttraccessLogo className="h-16 w-auto" />
          </div>
          {logoutPending ? <Spinner aria-label={logoutPendingLabel} /> : children}
        </div>
      </div>
    </div>
  );
}
