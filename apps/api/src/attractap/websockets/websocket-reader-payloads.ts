export interface ReaderCrashReportPayload {
  resetReason: string;
  rebootReason?: string | null;
  heapFreeBytes?: number | null;
  largestFreeBlockBytes?: number | null;
  uptimeBeforeResetMs?: number | null;
  wsState?: string | null;
  wifiState?: string | null;
  firmwareVersion?: string | null;
  coredumpBase64?: string | null;
}

export interface ResourceThumbnailDescriptorPayload {
  transferId: string;
  resourceId: number;
  width: number;
  height: number;
  format: 'PNG';
  contentLength: number;
}

// Firmware update related types
export interface FirmwareUpdateStartPayload {
  size: number;
  checksum?: string;
  version?: string;
  is_retry?: boolean;
}

export interface FirmwareRequestChunkPayload {
  offset: number;
  length: number;
}

export interface FirmwareUpdateResponse {
  ready?: boolean;
  success?: boolean;
  error?: string;
  bytes_received?: number;
  duration_ms?: number;
  retry_attempt?: number;
  max_attempts?: number;
  bytes_received_before_timeout?: number;
}
