// Firmware update related types
export { AttractapEvent, AttractapEventType, AttractapMessage } from './websocket-socket-state';
export {
  FormFieldAnswerValue,
  ResourceUsageFormCancelPayload,
  ResourceUsageFormFieldPayload,
  ResourceUsageFormFieldsPayload,
  ResourceUsageFormGetFieldsPayload,
  ResourceUsageFormMetaPayload,
  ResourceUsageFormPageErrorPayload,
  ResourceUsageFormPageResultPayload,
  ResourceUsageFormRequestPayload,
  ResourceUsageFormSubmitPagePayload,
} from './websocket-socket-state';
export {
  FirmwareRequestChunkPayload,
  FirmwareUpdateResponse,
  FirmwareUpdateStartPayload,
  ReaderCrashReportPayload,
  ResourceThumbnailDescriptorPayload,
} from './websocket-reader-payloads';
export { AuthenticatedWebSocket } from './websocket-socket-state';

export interface ResourceUsageStatsPayload {
  resourceId: number;
  usage: {
    id: number;
    operatingDurationMs: number | null;
    isOperating: boolean | null;
    meters: {
      id: number;
      /** Meter name and rate captured at session start. */
      name: string;
      creditsPerUnit: number;
      formattedRate: string;
      /** Decimal quantities stay strings to preserve their full precision. */
      value: string | null;
    }[];
  } | null;
}

/** Additive stop reply; requestId is copied by the reply helper. */
export interface StopResourceUsageSessionPayload {
  success: true;
  requestId?: number;
  durationSeconds?: number;
  endedOwnSession: boolean;
  billingSummary?: { amount: number; total: string };
}
