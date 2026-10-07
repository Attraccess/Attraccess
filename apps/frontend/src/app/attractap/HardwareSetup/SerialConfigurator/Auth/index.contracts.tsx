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
  sendAuthedCommand: <T = unknown>(
    topic: string,
    payload?: Record<string, unknown>,
    options?: SendOptions,
  ) => Promise<T>;
};
