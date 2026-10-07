import { BadGatewayException } from '@nestjs/common';

export /**
 * Talking to the device failed (unreachable, rejected credentials, …). Surface
 * the reason as a 502 instead of letting it bubble up as an opaque 500.
 */
function toDeviceCommunicationException(err: unknown): BadGatewayException {
  return new BadGatewayException(err instanceof Error ? err.message : String(err));
}
