import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { ESPTools } from '../../../../../utils/esp-tools';
import type { AttractapConfiguration } from './index.contracts';
import type { SendOptions } from './index.contracts';
import type { NetworkStatusData } from './index.contracts';
import type { ApiStatusData } from './index.contracts';
import type { WifiNetwork } from './index.contracts';
import { AttractapSerialCommContext } from './index.attractap-serial-comm-context';

export function AttractapSerialCommProvider({ children }: PropsWithChildren) {
  const [pinIsSet, setPinIsSet] = useState<boolean | null>(null);
  const [authCode, setAuthCode] = useState<string | null>(null);
  const [configuration, setConfiguration] = useState<AttractapConfiguration | null>(null);
  const [isFetchingConfiguration, setIsFetchingConfiguration] = useState(false);

  const refreshPinStatus = useCallback(async () => {
    const espTools = ESPTools.getInstance();
    const response = await espTools.sendCommand({ topic: 'auth.status.get' }, true, 5000);

    if (!response) {
      throw new Error('NO_RESPONSE');
    }

    const data = JSON.parse(response) as { pinIsSet?: boolean };

    const isSet = Boolean(data?.pinIsSet);
    setPinIsSet(isSet);

    if (!isSet) {
      setAuthCode(null);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      refreshPinStatus().catch((err) => console.error('Failed to fetch PIN status', err));
    }, 3000);
    return () => clearTimeout(id);
  }, [refreshPinStatus]);

  const sendAuthedCommand = useCallback(
    async <T,>(topic: string, payload?: Record<string, unknown>, options?: SendOptions) => {
      const espTools = ESPTools.getInstance();
      const payloadObj: Record<string, unknown> = payload ? { ...payload } : {};

      const codeToUse = !topic.startsWith('auth.') ? (options?.authCodeOverride ?? authCode) : undefined;
      if (codeToUse) {
        payloadObj.authCode = codeToUse;
      }

      const payloadString = Object.keys(payloadObj).length > 0 ? JSON.stringify(payloadObj) : undefined;

      const response = await espTools.sendCommand({ topic, payload: payloadString }, true, options?.timeout ?? 15000);

      if (!response) {
        throw new Error('NO_RESPONSE');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(response);
      } catch {
        throw new Error('INVALID_JSON');
      }

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed as { error?: unknown }).error) {
        const err = new Error(String((parsed as { error?: unknown }).error));
        err.name = 'CommandError';
        throw err;
      }

      return parsed as T;
    },
    [authCode],
  );

  const fetchConfiguration = useCallback(async () => {
    setIsFetchingConfiguration(true);
    try {
      const networkStatus = await sendAuthedCommand<NetworkStatusData>('network.status.get', {});
      const apiStatus = await sendAuthedCommand<ApiStatusData>('api.status.get', {});
      const wifiNetworks = await sendAuthedCommand<WifiNetwork[]>('network.wifi.ssids.get', {}, { timeout: 15000 });

      const config: AttractapConfiguration = {
        networkStatus,
        apiStatus,
        wifiNetworks: Array.isArray(wifiNetworks) ? wifiNetworks : [],
      };
      setConfiguration(config);
      return config;
    } finally {
      setIsFetchingConfiguration(false);
    }
  }, [sendAuthedCommand]);

  const value = useMemo(
    () => ({
      authCode,
      pinIsSet,
      isAuthenticated: pinIsSet === true && !!authCode,
      configuration,
      isFetchingConfiguration,
      setAuthCode,
      refreshPinStatus,
      fetchConfiguration,
      sendAuthedCommand,
    }),
    [
      authCode,
      pinIsSet,
      configuration,
      isFetchingConfiguration,
      refreshPinStatus,
      fetchConfiguration,
      sendAuthedCommand,
    ],
  );

  return <AttractapSerialCommContext.Provider value={value}>{children}</AttractapSerialCommContext.Provider>;
}
