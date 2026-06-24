import { useEffect } from 'react';
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

  useEffect(() => {
    if (location.pathname.startsWith(KIOSK_PREFIX)) {
      sessionStorage.setItem(STORAGE_KEY, location.pathname + location.search);
      return;
    }

    const ret = sessionStorage.getItem(STORAGE_KEY);
    if (ret) {
      navigate(ret, { replace: true });
    }
  }, [location, navigate]);

  return null;
}
