// Drives one Bluetooth setup: choose a device, read its info, run the steps.
// Owns the BLE connection and drops it on finish, failure, reset and unmount.
// The passwords only pass through `run` into the device; no state keeps them.
import { useCallback, useEffect, useRef, useState } from 'react';
import { addDevice } from '../../api';
import { useShellyTranslations } from '../../i18n';
import { SetupStepError, type SetupStep } from '../../bluetooth/errors';
import { getDeviceInfo, runSetup, type BleDeviceInfo, type SetupOutcome } from '../../bluetooth/provisioning';
import type { ShellyBleRpc } from '../../bluetooth/rpc';
import { connectShellyOverBle, isChooserCancelled, type ShellyBleConnection } from '../../bluetooth/webBluetooth';
import { describeConnectError, describeSetupError } from './describeSetupError';
import type { SetupFormValues } from './SetupForm';
import type { StepStatus } from './SetupProgress';

export type SetupPhase =
  | { kind: 'start'; error?: string }
  | { kind: 'connecting' }
  | { kind: 'form'; info: BleDeviceInfo; advertisedName: string; rpc: ShellyBleRpc }
  | {
      kind: 'running';
      info: BleDeviceInfo;
      disableBluetooth: boolean;
      statuses: Partial<Record<SetupStep, StepStatus>>;
    }
  | {
      kind: 'failed';
      info: BleDeviceInfo;
      disableBluetooth: boolean;
      statuses: Partial<Record<SetupStep, StepStatus>>;
      message: string;
    }
  | { kind: 'done'; info: BleDeviceInfo; outcome: SetupOutcome; name: string };

export function useSetupSession(onRegistered: () => void) {
  const { t } = useShellyTranslations();
  const [phase, setPhase] = useState<SetupPhase>({ kind: 'start' });
  const connection = useRef<ShellyBleConnection | null>(null);

  const disconnect = useCallback(() => {
    connection.current?.disconnect();
    connection.current = null;
  }, []);

  useEffect(() => disconnect, [disconnect]);

  const reset = useCallback(() => {
    disconnect();
    setPhase({ kind: 'start' });
  }, [disconnect]);

  const connect = useCallback(async () => {
    setPhase({ kind: 'connecting' });
    try {
      const conn = await connectShellyOverBle();
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
      const statuses: Partial<Record<SetupStep, StepStatus>> = {};
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
            register: (input) => addDevice(input),
          },
          {
            onStep: (step, status) => {
              statuses[step] = status === 'running' ? 'running' : status;
              if (step === 'register' && status === 'done') registered = true;
              setPhase({ kind: 'running', ...base, statuses: { ...statuses } });
            },
          },
        );
        setPhase({ kind: 'done', info, outcome, name: values.name });
      } catch (err) {
        if (err instanceof SetupStepError) statuses[err.step] = 'failed';
        setPhase({ kind: 'failed', ...base, statuses: { ...statuses }, message: describeSetupError(err, t) });
      } finally {
        disconnect();
        if (registered) onRegistered();
      }
    },
    [disconnect, onRegistered, t],
  );

  return { phase, connect, run, reset };
}
