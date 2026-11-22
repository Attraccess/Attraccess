import { BadRequestException, ServiceUnavailableException, type HttpException } from '@nestjs/common';
import { SidecarClientError } from '../client/errors';
import { conflict, forbidden, sidecarCode, sidecarFailure } from '../fabric/errors';

/** What the sidecar's refusal of `commissioning.start` means to the caller. Only our own wording; never the sidecar's. */
export function startFailure(error: unknown): HttpException {
  switch (sidecarCode(error)) {
    case 'validation_failed':
      return new BadRequestException({ code: 'invalid_code', message: 'The setup code is not valid.' });
    case 'attestation_override_disabled':
      return forbidden(
        'attestation_override_disabled',
        'The Matter sidecar does not allow the attestation override. An operator enables it on a development install only.',
      );
    case 'fabric_absent':
      return conflict('fabric_absent', 'The sidecar has no fabric yet. Create the fabric first.');
    case 'unsupported_capability':
      return new ServiceUnavailableException({
        code: 'unsupported_capability',
        message: 'This Matter sidecar release cannot commission devices.',
      });
    default:
      return sidecarFailure(error);
  }
}

export type RemovalFailureReason =
  'device_unreachable' | 'timeout' | 'busy' | 'sidecar_unavailable' | 'not_found' | 'internal';

/** The closed reason of a failed removal or share call, for the audit entry. */
export function failureReason(error: unknown): RemovalFailureReason {
  switch (sidecarCode(error)) {
    case 'device_unreachable':
      return 'device_unreachable';
    case 'timeout':
      return 'timeout';
    case 'busy':
      return 'busy';
    case 'not_found':
      return 'not_found';
    case 'sidecar_unavailable':
    case 'network':
      return 'sidecar_unavailable';
    default:
      return 'internal';
  }
}

/** A failed `nodes.remove`. The device was not changed in any of these cases. */
export function removalFailure(error: unknown, mode: 'normal' | 'force'): HttpException {
  switch (failureReason(error)) {
    case 'device_unreachable':
      return conflict(
        'device_unreachable',
        'The device could not be reached, so it was not removed from the fabric. Nothing was changed. ' +
          'Force removal forgets the device here without contacting it.',
      );
    case 'timeout':
      return conflict(
        'timeout',
        'The device did not answer in time, so it was not removed from the fabric. Nothing was changed. ' +
          'Force removal forgets the device here without contacting it.',
      );
    case 'not_found':
      return conflict(
        'node_not_on_sidecar',
        mode === 'force'
          ? 'The sidecar does not know this node. Use "force remove" of the record instead.'
          : 'The sidecar does not know this node. Run a reconciliation, or force remove the record.',
      );
    default:
      return sidecarFailure(error);
  }
}

export const isNotFound = (error: unknown): boolean =>
  error instanceof SidecarClientError && error.code === 'not_found';
