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
