import type { AuthenticatedRequest, PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';
import { UnauthorizedException, applyDecorators } from '@nestjs/common';
import { ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiBadRequestResponse } from '@nestjs/swagger';
import { RESERVATION_STATUSES, ReservationStatus } from '../entities/reservation.entity';
import { ReservationError } from '../reservations/errors';
import { ReservationErrorDto } from './dto.response';

/** Acting principal from the guard-authenticated request (never from the body). */
export function principalOf(request: Pick<AuthenticatedRequest, 'user'>): PluginAuditPrincipal {
  const user = request?.user;
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) throw new UnauthorizedException();
  const method = user.authenticationMethod ?? 'session';
  if (method === 'api-token' && !Number.isSafeInteger(user.apiTokenId)) throw new UnauthorizedException();
  return {
    userId: user.id,
    authenticationMethod: method,
    ...(method === 'api-token' ? { apiTokenId: user.apiTokenId } : {}),
  };
}

export function parseDate(value: string | undefined, field: string): Date | undefined {
  if (value === undefined || value === '') return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ReservationError('INVALID_RANGE', `${field} must be an ISO 8601 date`);
  return date;
}

export function requireDate(value: string | undefined, field: string): Date {
  const date = parseDate(value, field);
  if (!date) throw new ReservationError('INVALID_RANGE', `${field} is required`);
  return date;
}

export function parseStatus(value: string | undefined): ReservationStatus | undefined {
  if (value === undefined || value === '') return undefined;
  if (!(RESERVATION_STATUSES as readonly string[]).includes(value)) {
    throw new ReservationError('INVALID_RANGE', `status must be one of ${RESERVATION_STATUSES.join(', ')}`);
  }
  return value as ReservationStatus;
}

export function parseInteger(value: string | undefined, field: string, fallback?: number): number | undefined {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new ReservationError('INVALID_RANGE', `${field} must be an integer`);
  return parsed;
}

/** Documents the typed error bodies (`{ code, message }`) of an endpoint. */
export function ApiReservationErrors(options: {
  conflict?: readonly string[];
  forbidden?: boolean;
  notFound?: boolean;
  badRequest?: boolean;
}) {
  const decorators = [];
  if (options.badRequest) {
    decorators.push(
      ApiBadRequestResponse({
        type: ReservationErrorDto,
        description: 'Validation failed (typed code or field messages)',
      }),
    );
  }
  if (options.forbidden)
    decorators.push(ApiForbiddenResponse({ type: ReservationErrorDto, description: 'Not allowed (FORBIDDEN)' }));
  if (options.notFound) {
    decorators.push(
      ApiNotFoundResponse({ type: ReservationErrorDto, description: 'RESERVATION_NOT_FOUND or RESOURCE_NOT_FOUND' }),
    );
  }
  if (options.conflict) {
    decorators.push(
      ApiConflictResponse({
        type: ReservationErrorDto,
        description: `Conflict. code is one of: ${options.conflict.join(', ')}`,
      }),
    );
  }
  return applyDecorators(...decorators);
}
