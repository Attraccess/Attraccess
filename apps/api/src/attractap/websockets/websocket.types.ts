// Firmware update related types
export { AttractapEvent, AttractapEventType, AttractapMessage } from './websocket-event';
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
} from './websocket-form-payloads';
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
