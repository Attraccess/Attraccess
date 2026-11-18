import { Attractap } from '@attraccess/react-query-client';

/**
 * Whether a reader is an Attractap BLE Bridge (GL.iNet GL-S10): no NFC, no display, no resources; it only
 * carries plugin Bluetooth traffic. Firmware before 2.7.0 does not report `nfc`; those readers have NFC.
 */
export function isBleBridge(reader: Pick<Attractap, 'firmware'>): boolean {
  return reader.firmware?.capabilities?.nfc === false;
}
