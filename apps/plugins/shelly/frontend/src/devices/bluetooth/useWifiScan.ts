import { useCallback, useEffect, useState } from 'react';
import { scanWifi, type WifiNetwork } from '../../bluetooth/provisioning';
import type { RpcCaller } from '../../bluetooth/rpc';

export type WifiScanState = { status: 'scanning' } | { status: 'done'; networks: WifiNetwork[] } | { status: 'failed' };

/** Scans once when mounted and again on demand. A failure only means "enter the SSID yourself". */
export function useWifiScan(rpc: RpcCaller): { state: WifiScanState; rescan: () => void } {
  const [state, setState] = useState<WifiScanState>({ status: 'scanning' });
  const [run, setRun] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'scanning' });
    scanWifi(rpc).then(
      (networks) => !cancelled && setState({ status: 'done', networks }),
      () => !cancelled && setState({ status: 'failed' }),
    );
    return () => {
      cancelled = true;
    };
  }, [rpc, run]);

  const rescan = useCallback(() => setRun((n) => n + 1), []);
  return { state, rescan };
}
