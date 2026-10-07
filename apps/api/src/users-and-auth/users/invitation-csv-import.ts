import { User } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FileUpload } from '../../common/types/file-upload.types';
import { CsvInviteConfigDto, CsvInviteRowErrorDto } from './dtos/csvInvite.dto';
import { mapEmailSendError } from './email-send-error.util';
import { InvitationCsvReadingImplementation } from './invitation-csv-reading';
export abstract class InvitationCsvImportImplementation extends InvitationCsvReadingImplementation {
  public async inviteUsersFromCsv(
    file: FileUpload | undefined,
    rawConfig: string | CsvInviteConfigDto,
    adminLocale?: string,
    actorId?: number,
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
      const invitedUsers = await this.inviteUsersTransactional(
        candidates.map((c) => ({ ...c, locale: adminLocale })),
        { grantAllPermissionsToFirst: true, actorId },
      );
      return invitedUsers;
    } catch (error) {
      throw mapEmailSendError(error);
    }
  }
}
