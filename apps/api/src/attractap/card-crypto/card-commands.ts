import { CLA_NATIVE, INS_ADDITIONAL_FRAME } from './ev2-session';

/**
 * Plain (unauthenticated) card commands, byte-identical to main's firmware
 * (rfid.cpp, pn532/desfire.cpp, pn532/ntag424/{authentication,card}.cpp).
 * Send these only outside an EV2 session: selecting an application ends it.
 */

/** AID of the Attraccess DESFire application (0xACCE55, sent LSB first). */
export const DESFIRE_AID_ATTRACCESS = Buffer.from([0x55, 0xce, 0xac]);
export const DESFIRE_APP_KEY_SETTINGS_1 = 0x0f;
export const DESFIRE_APP_KEY_SETTINGS_2 = 0x86;
export const CARD_KEY_VERSION_FREE = 0x00;

export const desfireSelectApplication = (aid: Buffer = DESFIRE_AID_ATTRACCESS): Buffer =>
  Buffer.concat([Buffer.from([CLA_NATIVE, 0x5a, 0x00, 0x00, 0x03]), aid, Buffer.from([0x00])]);

export const desfireCreateApplication = (
  aid: Buffer = DESFIRE_AID_ATTRACCESS,
  keySettings1 = DESFIRE_APP_KEY_SETTINGS_1,
  keySettings2 = DESFIRE_APP_KEY_SETTINGS_2,
): Buffer =>
  Buffer.concat([
    Buffer.from([CLA_NATIVE, 0xca, 0x00, 0x00, 0x05]),
    aid,
    Buffer.from([keySettings1, keySettings2, 0x00]),
  ]);

export const desfireGetKeyVersion = (keyNo: number): Buffer =>
  Buffer.from([CLA_NATIVE, 0x64, 0x00, 0x00, 0x01, keyNo, 0x00]);

export const ntagIsoSelectApplication = (): Buffer =>
  Buffer.from([0x00, 0xa4, 0x04, 0x00, 0x07, 0xd2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x01, 0x00]);

/** GetVersion, first frame. The firmware then sends two `additionalFrame()` commands (card.cpp). */
export const getVersion = (): Buffer => Buffer.from([CLA_NATIVE, 0x60, 0x00, 0x00, 0x00]);

/** Native "additional frame" request (90 AF 00 00 00), used to read the GetVersion follow-up frames. */
export const additionalFrame = (): Buffer => Buffer.from([CLA_NATIVE, INS_ADDITIONAL_FRAME, 0x00, 0x00, 0x00]);

/** Parse a plain `91 00` OK trailer. Returns the payload or null when the status is not success. */
export function parsePlainOk(response: Buffer, payloadLength = 0): Buffer | null {
  if (response.length !== payloadLength + 2) return null;
  if (response[payloadLength] !== 0x91 || response[payloadLength + 1] !== 0x00) return null;
  return response.subarray(0, payloadLength);
}
