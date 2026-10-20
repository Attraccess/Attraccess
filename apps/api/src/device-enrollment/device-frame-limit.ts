import { ENROLLMENT_LIMITS } from './enrollment-limits';

/** ws has no public per-connection payload setter. Real fragmented-message tests
 * cover this narrow compatibility seam, including reauthentication. */
export function setDeviceFrameLimit(connection: object, authenticated: boolean): void {
  const receiver = (connection as { _receiver?: { _maxPayload: number } })._receiver;
  if (receiver) receiver._maxPayload = authenticated ? 100 * 1024 * 1024 : ENROLLMENT_LIMITS.frameBytes;
}
