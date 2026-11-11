// Context and types live apart from the provider so screens the provider renders
// (e.g. the PIN form) can use the hook without importing the provider back.
import { createContext, useContext } from 'react';

export interface ApiStatusData {
  status:
    | 'disconnected'
    | 'connecting_tcp'
    | 'connecting_websocket'
    | 'connected'
    | 'pending_approval'
    | 'authenticating'
    | 'authenticated'
    | 'error_failed'
    | 'error_timed_out'
    | 'error_invalid_server';
  hostname: string;
  port: number;
  deviceId: string;
  useSSL: boolean;
  /** Set while a new reader waits for approval; rotates every 30 s. */
  enrollmentCode?: string;
  /** Time until the enrollment code rotates, sent together with the code. */
  enrollmentRotatesInMs?: number;
}

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

export interface AttractapConfiguration {
  networkStatus: NetworkStatusData;
  apiStatus: ApiStatusData;
  wifiNetworks: WifiNetwork[];
}

export type SendOptions = { timeout?: number; authCodeOverride?: string };

export type AttractapSerialCommContextValue = {
  authCode: string | null;
  pinIsSet: boolean | null;
  isAuthenticated: boolean;
  configuration: AttractapConfiguration | null;
  isFetchingConfiguration: boolean;
  setAuthCode: (code: string | null) => void;
  refreshPinStatus: () => Promise<void>;
  fetchConfiguration: () => Promise<AttractapConfiguration>;
  /** Re-reads only the API status (no Wi-Fi scan) and merges it into the loaded configuration. */
  refreshApiStatus: () => Promise<ApiStatusData>;
  sendAuthedCommand: <T = unknown>(
    topic: string,
    payload?: Record<string, unknown>,
    options?: SendOptions,
  ) => Promise<T>;
};

export const AttractapSerialCommContext = createContext<AttractapSerialCommContextValue | undefined>(undefined);

export function useAttractapSerialComm(): AttractapSerialCommContextValue {
  const ctx = useContext(AttractapSerialCommContext);
  if (!ctx) {
    throw new Error('useAttractapSerialComm must be used within AttractapSerialCommProvider');
  }
  return ctx;
}
