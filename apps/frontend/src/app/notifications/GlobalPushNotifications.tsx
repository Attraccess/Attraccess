import { useLocation } from 'react-router-dom';
import { PushPermissionModal } from './PushPermissionModal';

export function GlobalPushNotifications({ enabled, userId }: { enabled: boolean; userId?: number }) {
  const { pathname } = useLocation();
  // Messages give notifications a concrete purpose, away from first-login setup.
  return <PushPermissionModal enabled={enabled && pathname === '/messages'} userId={userId} />;
}
