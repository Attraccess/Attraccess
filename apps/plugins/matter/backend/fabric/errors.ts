import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnprocessableEntityException,
  type HttpException,
} from '@nestjs/common';
import { SidecarClientError } from '../client/errors';

/** Error bodies of this feature are `{ code, message }`: the code is a stable string the UI maps to its own text. */
export const conflict = (code: string, message: string) => new ConflictException({ code, message });
export const unprocessable = (code: string, message: string) => new UnprocessableEntityException({ code, message });
export const forbidden = (code: string, message: string) => new ForbiddenException({ code, message });

export const NOT_CONNECTED = 'The Matter sidecar is not connected.';
export const INSECURE_MESSAGE =
  'The connection to the Matter sidecar is plain HTTP to another machine. Backups carry fabric secrets and are ' +
  'only made over HTTPS (or to a sidecar on this machine).';

/** The contract code of a sidecar failure, or `internal` for anything else. Never the message: it is not ours. */
export function sidecarCode(error: unknown): string {
  return error instanceof SidecarClientError ? String(error.code) : 'internal';
}

/** What an administrator hears about a failed sidecar call that changes the fabric. Only our own wording. */
export function sidecarFailure(error: unknown): HttpException {
  switch (sidecarCode(error)) {
    case 'fabric_exists':
      return conflict('fabric_exists', 'The sidecar already has a fabric.');
    case 'recovery_required':
      return conflict('recovery_required', 'The sidecar needs recovery before it can create a fabric.');
    case 'busy':
      return conflict('busy', 'The Matter sidecar is busy with another backup or restore. Try again shortly.');
    case 'sidecar_unavailable':
    case 'timeout':
    case 'network':
      return new ServiceUnavailableException({
        code: 'sidecar_unavailable',
        message: 'The Matter sidecar could not be reached.',
      });
    default:
      return new InternalServerErrorException({
        code: 'sidecar_error',
        message: 'The Matter sidecar refused the request.',
      });
  }
}
