import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { CircularProgress } from "../../../../../utils/heroui-compat";
import { Alert, Button, Input } from "@heroui/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type PropsWithChildren,
} from 'react';
import { ESPTools } from '../../../../../utils/esp-tools';
import { AttractapSerialConfiguratorPin } from '../Pin';

import de from './de.json';
import en from './en.json';

export interface NetworkStatusData {
  wifi_connected: boolean;
  wifi_ssid: string | null;
  wifi_ip: string;
  ethernet_connected: boolean;
  ethernet_ip: string;
}

export interface WifiNetwork {
  ssid: string;
  rssi: number;
  channel: number;
  encryption: string;
  isOpen: boolean;
}

export interface ApiStatusData {
  status:
    | 'disconnected'
    | 'connecting_tcp'
    | 'connecting_websocket'
    | 'connected'
    | 'authenticating'
    | 'authenticated'
    | 'error_failed'
    | 'error_timed_out'
    | 'error_invalid_server';
  hostname: string;
  port: number;
  deviceId: string;
  useSSL: boolean;
}

export interface AttractapConfiguration {
  networkStatus: NetworkStatusData;
  apiStatus: ApiStatusData;
  wifiNetworks: WifiNetwork[];
}

type SendOptions = { timeout?: number; authCodeOverride?: string };

type AttractapSerialCommContextValue = {
  authCode: string | null;
  pinIsSet: boolean | null;
  isAuthenticated: boolean;
  configuration: AttractapConfiguration | null;
  isFetchingConfiguration: boolean;
  setAuthCode: (code: string | null) => void;
  refreshPinStatus: () => Promise<void>;
  fetchConfiguration: () => Promise<AttractapConfiguration>;
  sendAuthedCommand: <T = unknown>(
    topic: string,
    payload?: Record<string, unknown>,
    options?: SendOptions,
  ) => Promise<T>;
};

const AttractapSerialCommContext = createContext<AttractapSerialCommContextValue | undefined>(undefined);

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

export function useAttractapSerialComm(): AttractapSerialCommContextValue {
  const ctx = useContext(AttractapSerialCommContext);
  if (!ctx) {
    throw new Error('useAttractapSerialComm must be used within AttractapSerialCommProvider');
  }
  return ctx;
}

export function AttractapSerialCommGate({ children }: PropsWithChildren) {
  const { t } = useTranslations({ de, en });
  const { pinIsSet, isAuthenticated, setAuthCode, sendAuthedCommand } = useAttractapSerialComm();

  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validatePin = useCallback((pin: string) => /^\d{4}$/.test(pin), []);

  const handleUnlock = useCallback(
    async (evt: FormEvent) => {
      evt.preventDefault();
      setError(null);

      if (!validatePin(pinInput)) {
        setError(t('errors.invalid'));
        return;
      }

      setIsSubmitting(true);
      try {
        await sendAuthedCommand('network.status.get', {}, { authCodeOverride: pinInput });
        setAuthCode(pinInput);
      } catch (err) {
        console.error(err);
        setError(t('errors.auth'));
      } finally {
        setIsSubmitting(false);
      }
    },
    [pinInput, sendAuthedCommand, setAuthCode, t, validatePin],
  );

  if (pinIsSet === null) {
    return (
      <div className="w-full flex flex-col items-center justify-center">
        <CircularProgress isIndeterminate label={t('loading')} />
      </div>
    );
  }

  if (!pinIsSet) {
    return <AttractapSerialConfiguratorPin mode="set" />;
  }

  if (!isAuthenticated) {
    return (
      <form className="flex flex-col gap-3" onSubmit={handleUnlock}>
        <Input
          label={t('fields.pin')}
          value={pinInput}
          onChange={(e) => setPinInput(e.target.value)}
          maxLength={4}
          inputMode="numeric"
          required
        />
        {error && <Alert color="danger">{error}</Alert>}
        <Button color="primary" type="submit" isLoading={isSubmitting}>
          {t('enterPin.submit')}
        </Button>
      </form>
    );
  }

  return children;
}
