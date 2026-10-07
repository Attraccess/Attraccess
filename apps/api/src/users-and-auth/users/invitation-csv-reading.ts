import { BadRequestException } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { parse as parseCsv } from 'csv-parse';
import { Readable } from 'stream';
import { FileUpload } from '../../common/types/file-upload.types';
import { CsvInviteConfigDto, CsvInviteRowErrorDto } from './dtos/csvInvite.dto';
import { UserInvitationServiceRouteContext } from './user-invitation.service.route-context';
export abstract class InvitationCsvReadingImplementation extends UserInvitationServiceRouteContext {
  public async parseCsvFile(
    file: FileUpload | undefined,
    config: CsvInviteConfigDto,
  ): Promise<{
    candidates: Array<{ username: string; email: string; row: number }>;
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

        if (rowErrors.length) {
          errors.push(...rowErrors);
          continue;
        }

        const roleKey = config.roleKeyColumn ? (rowData[config.roleKeyColumn] ?? '').trim() || undefined : undefined;
        candidates.push({
          username: normalizedUsername,
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

    const requiredColumns = new Set([config.emailKey, config.usernameKey]);

    requiredColumns.forEach((column) => {
      if (column && !header?.includes(column)) {
        errors.push({ row: 0, field: column, message: 'REQUIRED' });
      }
    });

    return { candidates, errors, emailRowMap, usernameRowMap };
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
