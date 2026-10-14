import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const KIOSK_PREFIX = '/kiosk/';
const STORAGE_KEY = 'kiosk-return';

// Once a tab enters kiosk mode it must not be able to leave it via any in-app
// link or navigate() call (usage history, docs editor, messaging, markdown
// links, …). Rather than hunting down every link, we remember the kiosk URL and
// bounce the tab back the moment its location leaves /kiosk/*.
// ponytail: sessionStorage flag is per-tab and never cleared in-app — kiosk ends
// only by closing the tab, which is what a kiosk wants. Add an explicit exit if
// an admin ever needs to leave kiosk without closing the tab.
export function KioskGuard() {
  const location = useLocation();
  const navigate = useNavigate();
  const kioskReturn = useRef<string | null>(null);

  useEffect(() => {
    if (location.pathname.startsWith(KIOSK_PREFIX)) {
      kioskReturn.current = location.pathname + location.search;
      try {
        sessionStorage.setItem(STORAGE_KEY, kioskReturn.current);
      } catch {
        // Retain the kiosk destination in memory when storage is unavailable.
      }
      return;
    }

    try {
      kioskReturn.current = sessionStorage.getItem(STORAGE_KEY) ?? kioskReturn.current;
    } catch {
      // Public routes remain usable; an entered kiosk still cannot be left.
    }
    if (kioskReturn.current) {
      navigate(kioskReturn.current, { replace: true });
    }
  }, [location, navigate]);

  return null;
}
