import { User } from '@attraccess/database-entities';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { PaginationOptions } from '../../types/request';
export type UserListOptions = PaginationOptions & {
  search?: string;
  ids?: number[];
  roleId?: number;
  roleIds?: number[];
  excludeRoleIds?: number[];
  roleMatch?: 'any' | 'all';
  emailVerified?: boolean;
  ssoProviderIds?: number[];
  excludeSsoProviderIds?: number[];
  ssoProviderNone?: boolean;
  hasSsoProvider?: boolean;
  ssoProviderMatch?: 'any' | 'all';
  includeRoles?: boolean;
};
export class DeleteAccountTokenInvalidException extends BadRequestException {
  constructor() {
    super('DeleteAccountTokenInvalidException');
  }
}
export class DeleteAccountTokenExpiredException extends UnauthorizedException {
  constructor() {
    super('DeleteAccountTokenExpiredException');
  }
}
export class UserHasActiveUsageSessionsException extends BadRequestException {
  constructor() {
    super('UserHasActiveUsageSessions');
  }
}
export type UpdateUserData = Partial<
  Pick<
    User,
    | 'externalIdentifier'
    | 'emailVerificationToken'
    | 'emailVerificationTokenExpiresAt'
    | 'isEmailVerified'
    | 'passwordResetToken'
    | 'passwordResetTokenExpiresAt'
    | 'lockedUntil'
    | 'failedLoginAttempts'
    | 'firstFailedLoginAt'
  >
>;
export const FindOneOptionsSchema = z
  .object({
    id: z.number(),
    username: z.string().min(1),
    email: z.string().email(),
    externalIdentifier: z.string().optional(),
  })
  .partial()
  .refine((data) => Object.values(data).filter((val) => val !== undefined).length > 0, {
    message: 'At least one search criteria must be provided',
  });
export type FindOneOptions = z.infer<typeof FindOneOptionsSchema>;
