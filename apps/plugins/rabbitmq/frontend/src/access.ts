// Whether the signed-in user may see the RabbitMQ panels at all. The host pushes the auth state, including the
// effective permission keys, through `onApiAuthStateChange`. Without `rabbitmq.broker.read` (from
// backend/permission-keys.ts) every plugin route answers 403, so the slots render nothing and request nothing. The API
// enforces the key on its own; the manage tier comes from the capabilities endpoint.
import { hasPluginAuthPermission, type AttraccessFrontendPluginAuthData } from '@attraccess/plugins-frontend-sdk';
import { useSyncExternalStore } from 'react';
import { RABBITMQ_BROKER_READ } from '../../backend/permission-keys';

let authData: AttraccessFrontendPluginAuthData | null = null;
const listeners = new Set<() => void>();

export function setRabbitmqAuthData(next: AttraccessFrontendPluginAuthData | null): void {
  authData = next;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useCanViewBroker(): boolean {
  const current = useSyncExternalStore(subscribe, () => authData);
  return hasPluginAuthPermission(current, RABBITMQ_BROKER_READ);
}
