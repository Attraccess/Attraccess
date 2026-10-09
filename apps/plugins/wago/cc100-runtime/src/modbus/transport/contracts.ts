export type TransactionAdmission = (() => boolean) & { expiresAt?: number };

import { type ModbusConnection } from '../../../../modbus/model';
export type SerialExchange = (
  connection: Extract<ModbusConnection, { transport: 'rtu' }>,
  request: Buffer,
  /** Resolve/reject only after teardown; observe abort to stop a timed-out transaction. */
  signal?: AbortSignal,
  /** Recheck after preparation/readiness, immediately before authorizing the first byte. */
  isCurrent?: TransactionAdmission,
) => Promise<Buffer>;

export interface ModbusTransport {
  request(unit: number, pdu: Buffer, isCurrent?: TransactionAdmission): Promise<Buffer>;
}

export const READ_FUNCTION_CODES = new Set([0x01, 0x02, 0x03, 0x04]);

export const MAX_RECOVERY_DELAY_MS = 60_000;

export type BusRecovery = { delayMs: number; probe: () => Promise<void> };
