// What the signed-in user may do in the RabbitMQ panels (manage tier).
//
// The backend computes this from the plugin's permission constants, so the UI
// never re-implements permission logic. It only hides controls: every manage
// route still enforces the permission server-side.
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';
import { useEffect, useState } from 'react';

export interface RabbitmqCapabilities {
  canManage: boolean;
}

const api = createPluginApiClient('/api/rabbitmq/capabilities');

// Fails closed: manage controls stay hidden until the backend says otherwise.
// `enabled` keeps servers that are not RabbitMQ brokers from calling the plugin API at all.
export function useCapabilities(enabled = true): RabbitmqCapabilities {
  const [capabilities, setCapabilities] = useState<RabbitmqCapabilities>({ canManage: false });
  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    api
      .request<RabbitmqCapabilities>('')
      .then((result) => {
        if (active) setCapabilities({ canManage: result?.canManage === true });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [enabled]);
  return capabilities;
}
