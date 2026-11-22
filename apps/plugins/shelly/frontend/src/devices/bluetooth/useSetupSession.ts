// Drives one Bluetooth setup: choose a device, read its info, run the steps.
// Owns the BLE connection and drops it on finish, failure, reset and unmount.
// The passwords only pass through `run` into the device; no state keeps them.
import { PluginApiError } from '@attraccess/plugins-frontend-sdk';
import { useCallback, useEffect, useRef, useState } from 'react';
import { addDevice } from '../../api';
import { useShellyTranslations } from '../../i18n';
import { SetupStepError, type SetupStep } from '../../bluetooth/errors';
import {
  getDeviceInfo,
  runSetup,
  type BleDeviceInfo,
  type SetupOutcome,
  type WifiChoice,
} from '../../bluetooth/provisioning';
import type { AuthenticatingRpc } from '../../bluetooth/rpc';
import { connectShellyOverBle, isChooserCancelled, type ShellyBleConnection } from '../../bluetooth/webBluetooth';
import { describeConnectError, describeSetupError, type SetupFailure } from './describeSetupError';

export type StepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

export type StepStatuses = Partial<Record<SetupStep, StepStatus>>;

export interface SetupFormValues {
  wifi: WifiChoice;
  adminPassword: string;
  name: string;
  disableBluetooth: boolean;
}

export type SetupPhase =
  | { kind: 'start'; error?: string }
  | { kind: 'connecting' }
  | { kind: 'form'; info: BleDeviceInfo; advertisedName: string; rpc: AuthenticatingRpc }
  | { kind: 'running'; info: BleDeviceInfo; disableBluetooth: boolean; statuses: StepStatuses }
  | { kind: 'failed'; info: BleDeviceInfo; disableBluetooth: boolean; statuses: StepStatuses; failure: SetupFailure }
  | { kind: 'done'; info: BleDeviceInfo; outcome: SetupOutcome; name: string };

/** Adds the device; an address that is in the registry already is reported, not thrown. */
async function register(input: { ipAddress: string; name: string }): Promise<'added' | 'alreadyRegistered'> {
  try {
    await addDevice(input);
    return 'added';
  } catch (err) {
    if (err instanceof PluginApiError && err.status === 409) return 'alreadyRegistered';
    throw err;
  }
}

export function useSetupSession(onRegistered: () => void) {
  const { t } = useShellyTranslations();
  const [phase, setPhase] = useState<SetupPhase>({ kind: 'start' });
  const connection = useRef<ShellyBleConnection | null>(null);
  const mounted = useRef(true);

  const disconnect = useCallback(() => {
    connection.current?.disconnect();
    connection.current = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      disconnect();
    };
  }, [disconnect]);

  const reset = useCallback(() => {
    disconnect();
    setPhase({ kind: 'start' });
  }, [disconnect]);

  const connect = useCallback(async () => {
    setPhase({ kind: 'connecting' });
    try {
      const conn = await connectShellyOverBle();
      // The drawer may have gone while the chooser was open; never keep that link.
      if (!mounted.current) return conn.disconnect();
      connection.current = conn;
      const info = await getDeviceInfo(conn.rpc);
      setPhase({ kind: 'form', info, advertisedName: conn.advertisedName, rpc: conn.rpc });
    } catch (err) {
      disconnect();
      // Closing the browser chooser is not an error.
      setPhase(isChooserCancelled(err) ? { kind: 'start' } : { kind: 'start', error: describeConnectError(err, t) });
    }
  }, [disconnect, t]);

  const run = useCallback(
    async (info: BleDeviceInfo, values: SetupFormValues) => {
      const conn = connection.current;
      if (!conn) return setPhase({ kind: 'start' });
      const statuses: StepStatuses = {};
      const base = { info, disableBluetooth: values.disableBluetooth };
      setPhase({ kind: 'running', ...base, statuses: {} });
      let registered = false;
      try {
        const outcome = await runSetup(
          conn.rpc,
          {
            info,
            adminPassword: values.adminPassword,
            wifi: values.wifi,
            name: values.name,
            disableBluetooth: values.disableBluetooth,
            register,
          },
          {
            onStep: (step, status) => {
              statuses[step] = status;
              if (step === 'register' && status === 'done') registered = true;
              setPhase({ kind: 'running', ...base, statuses: { ...statuses } });
            },
          },
        );
        setPhase({ kind: 'done', info, outcome, name: values.name });
      } catch (err) {
        if (err instanceof SetupStepError) statuses[err.step] = 'failed';
        setPhase({
          kind: 'failed',
          ...base,
          statuses: { ...statuses },
          failure: describeSetupError(err, t, { protectedDevice: Boolean(info.auth_en) }),
        });
      } finally {
        disconnect();
        if (registered) onRegistered();
      }
    },
    [disconnect, onRegistered, t],
  );

  return { phase, connect, run, reset };
}
