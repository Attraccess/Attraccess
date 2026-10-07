import { User } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { FileUpload } from '../../common/types/file-upload.types';
import { CsvInviteConfigDto, CsvInviteRowErrorDto } from './dtos/csvInvite.dto';
import { UsersService } from './users.service';

export abstract class UserInvitationServiceRouteContext {
  protected abstract validateCsvIdentity(
    rowData: Record<string, string>,
    config: CsvInviteConfigDto,
    rowNumber: number,
    rowErrors: CsvInviteRowErrorDto[],
  ): { email: string; normalizedUsername: string };
  protected abstract readonly logger: Logger;
  protected abstract readonly usersService: UsersService;
  public abstract parseCsvFile(
    file: FileUpload | undefined,
    config: CsvInviteConfigDto,
  ): Promise<{
    candidates: Array<{ username: string; email: string; row: number }>;
    errors: CsvInviteRowErrorDto[];
    emailRowMap: Map<string, number[]>;
    usernameRowMap: Map<string, number[]>;
  }>;
  protected abstract inviteUsersTransactional(
    candidates: Array<{ username: string; email: string; locale?: string; roleKey?: string }>,
    options?: { grantAllPermissionsToFirst?: boolean; actorId?: number },
  ): Promise<User[]>;
}
