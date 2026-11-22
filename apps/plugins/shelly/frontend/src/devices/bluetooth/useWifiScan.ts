import { useCallback, useEffect, useRef, useState } from 'react';
import { ADMIN_USERNAME, scanWifi, type WifiNetwork } from '../../bluetooth/provisioning';
import type { AuthenticatingRpc } from '../../bluetooth/rpc';

export type WifiScanState = { status: 'scanning' } | { status: 'done'; networks: WifiNetwork[] } | { status: 'failed' };

interface InflightScan {
  rpc: AuthenticatingRpc;
  run: number;
  scan: Promise<WifiNetwork[]>;
}

/** Scans once when mounted and again on demand. A failure only means "enter the SSID yourself". */
export function useWifiScan(rpc: AuthenticatingRpc): {
  state: WifiScanState;
  rescan: (adminPassword?: string) => void;
} {
  const [state, setState] = useState<WifiScanState>({ status: 'scanning' });
  const [run, setRun] = useState(0);
  const inflight = useRef<InflightScan | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'scanning' });
    // Effects can run twice for one scan (StrictMode); a second WiFi.Scan would
    // queue behind the first on the device, so share the running one.
    const current = inflight.current;
    const scan = current?.rpc === rpc && current.run === run ? current.scan : scanWifi(rpc);
    inflight.current = { rpc, run, scan };
    scan.then(
      (networks) => !cancelled && setState({ status: 'done', networks }),
      () => !cancelled && setState({ status: 'failed' }),
    );
    return () => {
      cancelled = true;
    };
  }, [rpc, run]);

  const rescan = useCallback(
    (adminPassword?: string) => {
      // A protected device refuses to scan until the connection has its admin password.
      if (adminPassword) rpc.setCredentials(ADMIN_USERNAME, adminPassword);
      setRun((n) => n + 1);
    },
    [rpc],
  );
  return { state, rescan };
}
