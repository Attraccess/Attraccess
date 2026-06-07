import { BadRequestException, Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { SystemPermissions, User } from '@attraccess/database-entities';
import { EntityManager } from 'typeorm';
import { parse as parseCsv } from 'csv-parse';
import { Readable } from 'stream';
import { plainToInstance } from 'class-transformer';
import { validate, isEmail } from 'class-validator';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../../email/email.service';
import { InviteUserDto } from './dtos/inviteUser.dto';
import { CsvInviteConfigDto, CsvInviteRowErrorDto } from './dtos/csvInvite.dto';
import { FileUpload } from '../../common/types/file-upload.types';
import { mapEmailSendError } from './email-send-error.util';

/**
 * Single and bulk (CSV) user invitations, including CSV parsing/validation and
 * the transactional create-and-invite flow.
 */
@Injectable()
export class UserInvitationService {
  private readonly logger = new Logger(UserInvitationService.name);

  constructor(
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
  ) {}

  private async inviteUsersTransactional(
    candidates: Array<{ username: string; email: string; systemPermissions: Partial<SystemPermissions> }>,
    options?: { grantAllPermissionsToFirst?: boolean },
  ): Promise<User[]> {
    await this.usersService.ensureLicenseForNewUsers(candidates.length);

    return this.usersService
      .withTransaction(async (manager: EntityManager) => {
        const createdUsers = await this.usersService.createMany(candidates, {
          grantAllPermissionsToFirst: options?.grantAllPermissionsToFirst ?? false,
          manager,
        });

        for (const user of createdUsers) {
          const verificationToken = await this.authService.generateEmailVerificationToken(user, manager);
          await this.emailService.sendUserInvitationEmail(user, verificationToken, manager);
        }

        return createdUsers;
      })
      .catch((error) => mapEmailSendError(error));
  }

  public async parseCsvFile(
    file: FileUpload | undefined,
    config: CsvInviteConfigDto,
  ): Promise<{
    candidates: Array<{ username: string; email: string; systemPermissions: Partial<SystemPermissions>; row: number }>;
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
      email: string;
      systemPermissions: Partial<SystemPermissions>;
      row: number;
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

        const emailKey = email.toLowerCase();
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

        const systemPermissions: Partial<SystemPermissions> = {};
        (
          Object.entries(config.permissions ?? {}) as [
            keyof SystemPermissions,
            { keyMapping: string; yesValue: string },
          ][]
        )
          .filter(([, mapping]) => !!mapping?.keyMapping)
          .forEach(([permissionKey, mapping]) => {
            const value = (rowData[mapping.keyMapping] ?? '').trim();
            if (value === mapping.yesValue) {
              systemPermissions[permissionKey] = true;
            }
          });

        if (rowErrors.length) {
          errors.push(...rowErrors);
          continue;
        }

        candidates.push({
          username: normalizedUsername,
          email,
          systemPermissions,
          row: rowNumber,
        });
      }
    } catch (error) {
      this.logger.error('Failed to parse CSV', error as Error);
      throw new BadRequestException('Invalid CSV file');
    }

    if (!header || header.every((value) => `${value}`.trim() === '')) {
      throw new BadRequestException('MISSING_HEADER_ROW');
    }

    const requiredColumns = new Set([config.emailKey, config.usernameKey]);

    requiredColumns.forEach((column) => {
      if (column && !header?.includes(column)) {
        errors.push({ row: 0, field: column, message: 'REQUIRED' });
      }
    });

    return { candidates, errors, emailRowMap, usernameRowMap };
  }

  public async inviteUser(body: InviteUserDto): Promise<User> {
    try {
      const [invited] = await this.inviteUsersTransactional(
        [
          {
            username: body.username,
            email: body.email,
            systemPermissions: {},
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
    rawConfig: string | CsvInviteConfigDto,
  ): Promise<User[]> {
    let configPayload: CsvInviteConfigDto | string;
    try {
      configPayload = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
    } catch {
      throw new BadRequestException('Invalid config payload');
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
      const emailRows = emailRowMap.get(user.email.trim().toLowerCase());
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
      const invitedUsers = await this.inviteUsersTransactional(candidates, { grantAllPermissionsToFirst: true });
      return invitedUsers;
    } catch (error) {
      throw mapEmailSendError(error);
    }
  }
}
