import { BusRecovery, MAX_RECOVERY_DELAY_MS } from './transport-contracts';
import { ModbusTransportError } from './transport-errors';

export type Bus = {
  tail: Promise<unknown>;
  pending: number;
  retryAt: number;
  quarantined?: ModbusTransportError;
  recovery?: BusRecovery;
  lastRecoveryFailureAt?: number;
  quarantine: Promise<ModbusTransportError>;
  markQuarantined: (error: ModbusTransportError) => void;
};
export const buses = new Map<string, Bus>();
export function quarantineBus(bus: Bus, message: string, recovery?: BusRecovery): void {
  if (bus.quarantined) return;
  bus.quarantined = new ModbusTransportError(
    'modbus_rtu_quarantined',
    recovery ? `${message}; probing for recovery` : `${message}; external resynchronization required`,
  );
  bus.markQuarantined(bus.quarantined);
  bus.recovery = recovery;
  bus.lastRecoveryFailureAt = Date.now();
  if (recovery) scheduleRecovery(bus, recovery.delayMs);
}
export function scheduleRecovery(bus: Bus, delayMs: number): void {
  const timer = setTimeout(async () => {
    const recovery = bus.recovery;
    if (!recovery) return;
    const quietRemaining = (bus.lastRecoveryFailureAt ?? 0) + recovery.delayMs - Date.now();
    if (quietRemaining > 0) {
      scheduleRecovery(bus, quietRemaining);
      return;
    }
    try {
      await bus.tail;
      await recovery.probe();
    } catch {
      bus.lastRecoveryFailureAt = Date.now();
      scheduleRecovery(bus, Math.min(Math.max(delayMs * 2, bus.recovery?.delayMs ?? 0), MAX_RECOVERY_DELAY_MS));
      return;
    }
    bus.quarantined = undefined;
    bus.recovery = undefined;
    bus.quarantine = new Promise<ModbusTransportError>((resolve) => {
      bus.markQuarantined = resolve;
    });
  }, delayMs);
  timer.unref?.();
}
