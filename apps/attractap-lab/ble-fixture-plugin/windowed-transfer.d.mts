export declare const MAX_WINDOW: number;
export declare function clampWindow(value: unknown): number;
export declare function percentile(sorted: number[], fraction: number): number | null;
export declare function checkAck(ack: Uint8Array, sequence: number, bytes: number): void;
export declare function windowedTransfer(options: {
  chunk: number;
  bytes: number;
  window?: unknown;
  minDurationMs?: number;
  write: (value: Uint8Array) => Promise<void>;
  nextAck: (signal: AbortSignal) => Promise<Uint8Array>;
  now?: () => number;
}): Promise<{
  window: number;
  chunks: number;
  acked: number;
  bytes: number;
  seconds: number;
  kibPerSecond: number;
  ackMedianMs: number | null;
  ackP95Ms: number | null;
}>;
