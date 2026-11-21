import type { UserRecord } from '@attraccess/application-models';
import type { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';

import { EmailService } from '../../email/email.service';

import { LicenseError } from '../../license/license.service';

import { AuthService } from '../auth/auth.service';

import { InviteUserDto } from './dtos/inviteUser.dto';

import { mapEmailSendError } from './email-send-error.util';

import { UsersService } from './users.service';
import { normalizeEmail } from './accounts/normalize-email';
import { normalizeUserName, userNameProblem } from './accounts/normalize-name';

import { plainToInstance } from 'class-transformer';

import { validate, isEmail } from 'class-validator';

import { FileUpload } from '../../common/types/file-upload.types';

import { CsvInviteConfigDto, CsvInviteRowErrorDto } from './dtos/csvInvite.dto';

import { parse as parseCsv } from 'csv-parse';

import { Readable } from 'stream';

@Injectable()
export class UserInvitationService {
  constructor(
    protected readonly usersService: UsersService,
    protected readonly authService: AuthService,
    protected readonly emailService: EmailService,
  ) {}

  protected readonly logger = new Logger(UserInvitationService.name);

  protected async inviteUsersTransactional(
    candidates: Array<{
      username: string;
      firstName?: string | null;
      lastName?: string | null;
      email: string;
      locale?: string;
      roleKey?: string;
    }>,
    options?: { grantAllPermissionsToFirst?: boolean; actor?: AuthenticatedUser },
  ): Promise<UserRecord[]> {
    try {
      await this.usersService.ensureLicenseForNewUsers(candidates.length);
    } catch (error) {
      if (error instanceof LicenseError) {
        this.logger.warn(`Blocking user invitation due to license: ${error.reason}`);
        throw new ForbiddenException(error.reason);
      }
      throw error;
    }

    // SMTP can take seconds, and while a transaction is open every other request waits for the connection: the mails
    // go out after the commit. A failed send takes the invitation back, as the rollback did when sending ran inside it.
    const send: { failure?: { error: unknown } } = {};
    const invitations = await this.usersService
      .withTransaction(async (scope) => {
        const createdUsers = await this.usersService.createMany(candidates, {
          grantAllPermissionsToFirst: options?.grantAllPermissionsToFirst ?? false,
          context: scope,
          actor: options?.actor,
        });

        const invited: Array<{ user: UserRecord; token: string }> = [];
        for (const user of createdUsers) {
          invited.push({ user, token: await this.authService.generateEmailVerificationToken(user, scope) });
        }
        scope.afterCommit(async () => {
          try {
            for (const { user, token } of invited) {
              await this.emailService.sendUserInvitationEmail(user, token);
            }
          } catch (error) {
            send.failure = { error };
            await this.takeBackInvitations(invited.map(({ user }) => user.id));
          }
        });
        return invited;
      })
      .catch((error) => mapEmailSendError(error));

    if (send.failure) mapEmailSendError(send.failure.error);
    return invitations.map(({ user }) => user);
  }

  private async takeBackInvitations(userIds: number[]): Promise<void> {
    try {
      await this.usersService.deleteUnacceptedInvitations(userIds);
    } catch (revertError) {
      this.logger.error('Failed to take back invitations after an email failure', (revertError as Error).stack);
    }
  }

  public async inviteUser(body: InviteUserDto, adminLocale?: string): Promise<UserRecord> {
    // createMany does not check for taken identities and the unique constraints would surface as a 500
    const email = normalizeEmail(body.email);
    const username = this.usersService.cleanupUsername(body.username);
    const existingUsers = await this.usersService.findByEmailsOrUsernames([email], [username]);
    if (existingUsers.some((user) => user.email === email)) {
      throw new BadRequestException('Email already exists');
    }
    if (existingUsers.some((user) => user.username === username)) {
      throw new BadRequestException('Username already exists');
    }

    try {
      const [invited] = await this.inviteUsersTransactional(
        [
          {
            username: body.username,
            firstName: body.firstName,
            lastName: body.lastName,
            email: body.email,
            locale: adminLocale,
          },
        ],
        { grantAllPermissionsToFirst: true },
      );

      return invited;
    } catch (error) {
      throw mapEmailSendError(error);
    }
  }

  public async inviteUsersFromCsv(
    file: FileUpload | undefined,
    rawConfig: string | CsvInviteConfigDto | undefined,
    adminLocale?: string,
    actor?: AuthenticatedUser,
  ): Promise<UserRecord[]> {
    let configPayload: unknown;
    try {
      configPayload = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
    } catch {
      throw new BadRequestException('Invalid config payload');
    }
    // class-validator throws a TypeError for null/undefined, so reject anything that is not an object first
    if (configPayload === undefined || configPayload === null) {
      throw new BadRequestException('config is required');
    }
    if (typeof configPayload !== 'object' || Array.isArray(configPayload)) {
      throw new BadRequestException('config must be a JSON object');
    }
    const config = plainToInstance(CsvInviteConfigDto, configPayload);
    const validationErrors = await validate(config, { whitelist: true, forbidNonWhitelisted: true });
    if (validationErrors.length) {
      throw new BadRequestException(validationErrors);
    }

    const { candidates, errors, emailRowMap, usernameRowMap } = await this.parseCsvFile(file, config);
    if (errors.length) {
      throw new BadRequestException({
        message: 'INVALID_CSV',
        errors,
      });
    }

    if (candidates.length === 0) {
      throw new BadRequestException({
        message: 'NO_CANDIDATES_IN_CSV',
        errors: [{ row: 0, message: 'NO_VALID_ROWS_FOUND_IN_CSV' }],
      });
    }

    const existingUsers = await this.usersService.findByEmailsOrUsernames(
      candidates.map((candidate) => candidate.email),
      candidates.map((candidate) => candidate.username),
    );

    const duplicateErrors: CsvInviteRowErrorDto[] = [];
    existingUsers.forEach((user) => {
      const emailRows = emailRowMap.get(normalizeEmail(user.email));
      if (emailRows?.length) {
        emailRows.forEach((row) =>
          duplicateErrors.push({ row, field: 'email', message: 'DUPLICATE_IN_DB', value: user.email }),
        );
      }

      const usernameRows = usernameRowMap.get(user.username.trim().toLowerCase());
      if (usernameRows?.length) {
        usernameRows.forEach((row) =>
          duplicateErrors.push({ row, field: 'username', message: 'DUPLICATE_IN_DB', value: user.username }),
        );
      }
    });

    if (duplicateErrors.length) {
      throw new BadRequestException({
        message: 'DUPLICATE_IN_DB',
        errors: duplicateErrors,
      });
    }

    try {
      const invitedUsers = await this.inviteUsersTransactional(
        candidates.map((c) => ({ ...c, locale: adminLocale })),
        { grantAllPermissionsToFirst: true, actor },
      );
      return invitedUsers;
    } catch (error) {
      throw mapEmailSendError(error);
    }
  }

  public async parseCsvFile(
    file: FileUpload | undefined,
    config: CsvInviteConfigDto,
  ): Promise<{
    candidates: Array<{
      username: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
      row: number;
    }>;
    errors: CsvInviteRowErrorDto[];
    emailRowMap: Map<string, number[]>;
    usernameRowMap: Map<string, number[]>;
  }> {
    if (!file) {
      throw new BadRequestException('CSV file is required');
    }

    const inputStream = file.buffer ? Readable.from(file.buffer) : undefined;
    if (!inputStream) {
      throw new BadRequestException('Unable to read CSV file');
    }

    const parser = parseCsv({
      bom: true,
      columns: true,
      relax_column_count: true,
      skip_empty_lines: false,
      trim: true,
    });

    let header: string[] | null = null;
    const candidates: Array<{
      username: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
      row: number;
      roleKey?: string;
    }> = [];
    const errors: CsvInviteRowErrorDto[] = [];
    const ignoredRows = new Set(config.ignoredRows ?? []);
    const seenEmails = new Set<string>();
    const seenUsernames = new Set<string>();
    const emailRowMap = new Map<string, number[]>();
    const usernameRowMap = new Map<string, number[]>();

    let dataRowIndex = 0;

    try {
      for await (const record of inputStream.pipe(parser)) {
        header = header ?? Object.keys(record ?? {});

        dataRowIndex += 1;
        const rowNumber = dataRowIndex;

        if (ignoredRows.has(rowNumber)) {
          continue;
        }

        const rowData: Record<string, string> = {};
        (header ?? []).forEach((headerLabel) => {
          const rawValue = record?.[headerLabel];
          rowData[headerLabel] = rawValue == null ? '' : String(rawValue).trim();
        });

        const isEmptyRow = Object.values(rowData).every((value) => value === '');
        if (isEmptyRow) {
          errors.push({ row: rowNumber, message: 'Row is empty' });
          continue;
        }

        const rowErrors: CsvInviteRowErrorDto[] = [];

        const { email, normalizedUsername } = this.validateCsvIdentity(rowData, config, rowNumber, rowErrors);

        const emailKey = normalizeEmail(email);
        if (email && seenEmails.has(emailKey)) {
          rowErrors.push({ row: rowNumber, field: 'email', message: 'DUPLICATE_IN_CSV', value: email });
        } else if (email) {
          seenEmails.add(emailKey);
          emailRowMap.set(emailKey, [...(emailRowMap.get(emailKey) ?? []), rowNumber]);
        }

        if (normalizedUsername && seenUsernames.has(normalizedUsername)) {
          rowErrors.push({
            row: rowNumber,
            field: 'username',
            message: 'DUPLICATE_IN_CSV',
            value: normalizedUsername,
          });
        } else if (normalizedUsername) {
          seenUsernames.add(normalizedUsername);
          usernameRowMap.set(normalizedUsername, [...(usernameRowMap.get(normalizedUsername) ?? []), rowNumber]);
        }

        if (rowErrors.length) {
          errors.push(...rowErrors);
          continue;
        }

        const roleKey = config.roleKeyColumn ? (rowData[config.roleKeyColumn] ?? '').trim() || undefined : undefined;
        const firstName = this.readCsvName(rowData, config.firstNameKey, 'firstName', rowNumber, rowErrors);
        const lastName = this.readCsvName(rowData, config.lastNameKey, 'lastName', rowNumber, rowErrors);
        if (rowErrors.length) {
          errors.push(...rowErrors);
          continue;
        }

        candidates.push({
          username: normalizedUsername,
          firstName,
          lastName,
          email,
          row: rowNumber,
          roleKey,
        });
      }
    } catch (error) {
      this.logger.error('Failed to parse CSV', error as Error);
      throw new BadRequestException('Invalid CSV file');
    }

    if (!header || header.every((value) => `${value}`.trim() === '')) {
      throw new BadRequestException('MISSING_HEADER_ROW');
    }

    const requiredColumns = new Set([config.emailKey, config.usernameKey, config.firstNameKey, config.lastNameKey]);

    requiredColumns.forEach((column) => {
      if (column && !header?.includes(column)) {
        errors.push({ row: 0, field: column, message: 'REQUIRED' });
      }
    });

    return { candidates, errors, emailRowMap, usernameRowMap };
  }

  /** An optional name column: trimmed, blank is null, and no longer than a stored name may be. */
  private readCsvName(
    rowData: Record<string, string>,
    key: string | undefined,
    field: 'firstName' | 'lastName',
    rowNumber: number,
    rowErrors: CsvInviteRowErrorDto[],
  ): string | null {
    const value = normalizeUserName(key ? rowData[key] : undefined);
    const problem = value === null ? null : userNameProblem(value);
    if (value !== null && problem) {
      rowErrors.push({ row: rowNumber, field, message: problem, value });
      return null;
    }
    return value;
  }

  protected validateCsvIdentity(
    rowData: Record<string, string>,
    config: CsvInviteConfigDto,
    rowNumber: number,
    rowErrors: CsvInviteRowErrorDto[],
  ): { email: string; normalizedUsername: string } {
    const email = (rowData[config.emailKey] ?? '').trim();
    if (!email) {
      rowErrors.push({ row: rowNumber, field: 'email', message: 'REQUIRED' });
    } else if (!isEmail(email)) {
      rowErrors.push({ row: rowNumber, field: 'email', message: 'INVALID', value: email });
    }

    const usernameOriginal = (rowData[config.usernameKey] ?? '').trim();
    let normalizedUsername = '';
    if (!usernameOriginal) {
      rowErrors.push({ row: rowNumber, field: 'username', message: 'REQUIRED' });
    } else {
      normalizedUsername = this.usersService.cleanupUsername(usernameOriginal);
      try {
        this.usersService.validateUsernameOrThrow(normalizedUsername);
      } catch (error) {
        rowErrors.push({
          row: rowNumber,
          field: 'username',
          message: (error as Error).message ?? 'INVALID',
          value: usernameOriginal,
        });
      }
    }
    return { email, normalizedUsername };
  }
}
