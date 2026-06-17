import { PushPermissionModal } from './PushPermissionModal';

export function GlobalPushNotifications({ enabled }: { enabled: boolean }) {
  return <PushPermissionModal enabled={enabled} />;
}
