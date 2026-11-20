import { AttractapEventType } from './websocket.types';

/**
 * Card relay, coredump and BLE events: a card conversation must not wait for the lastConnection update, and coredump
 * chunks and BLE traffic must not write it per chunk (a coredump's BEGIN and COMPLETE record the activity).
 */
export const SKIPS_ACTIVITY_WRITE = new Set<AttractapEventType>([
  AttractapEventType.CARD_DETECTED,
  AttractapEventType.CARD_APDU_RESPONSE,
  AttractapEventType.CARD_REMOVED,
  AttractapEventType.READER_COREDUMP_CHUNK,
  AttractapEventType.BLE_RESULT,
  AttractapEventType.BLE_SCAN_RESULT,
  AttractapEventType.BLE_NOTIFICATION,
  AttractapEventType.BLE_SESSION_ENDED,
  AttractapEventType.BLE_WATCH_STATE,
  AttractapEventType.BLE_WATCH_EVENT,
]);
