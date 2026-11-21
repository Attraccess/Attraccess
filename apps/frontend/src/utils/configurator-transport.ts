/** A line-protocol command: written as `CMND <topic> <payload>\n`, answered by `RESP <topic> <payload>\n`. */
export interface Command {
  topic: string;
  payload?: string;
}

export interface ConnectionStateEvent {
  connected: boolean;
  timestamp: number;
  /**
   * The device closed the link on purpose: a reader or BLE Bridge drops Bluetooth shortly after it reported
   * `authenticated` (its setup window closes). Not an error.
   */
  closedAfterPairing?: boolean;
}

export type ConfiguratorTransportKind = 'serial' | 'bluetooth';

/** How the hardware setup screens talk to a reader's configurator: USB serial (ESPTools) or Bluetooth (BleConfigurator). */
export interface ConfiguratorTransport {
  readonly kind: ConfiguratorTransportKind;
  readonly isConnected: boolean;
  /** Resolves with the payload of the matching `RESP` line, or null when none arrives within `timeout` ms. */
  sendCommand(command: Command, waitForResponse?: boolean, timeout?: number): Promise<string | null>;
  disconnect(): Promise<void>;
  on(event: 'connectionState', listener: (event: ConnectionStateEvent) => void): void;
  off(event: 'connectionState', listener: (event: ConnectionStateEvent) => void): void;
}

/** Strips leading non-printable bytes and splits a `RESP <topic> <payload>` line; null for other lines. */
export function parseResponseLine(line: string): { topic: string; payload: string } | null {
  const cleaned = line.trim().replace(/^[^\x20-\x7E]*/g, '');
  const match = cleaned.match(/^RESP\s+(\S+)\s+(.+)$/);
  return match ? { topic: match[1], payload: match[2] } : null;
}
