import { Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { User } from '@attraccess/database-entities';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { AuthRateLimitInterceptor } from '../rate-limiting/auth-rate-limit.interceptor';
import { InviteUserDto } from './dtos/inviteUser.dto';
import {
  CsvInviteConfigDto,
  CsvInviteErrorResponseDto,
  CsvInviteUploadDto,
} from './dtos/csvInvite.dto';
import { FileUpload } from '../../common/types/file-upload.types';
import { UserInvitationService } from './user-invitation.service';

@ApiTags('Users')
@Controller('users')
@UseInterceptors(AuthRateLimitInterceptor)
export class UserInvitationsController {
  constructor(private readonly invitationService: UserInvitationService) {}

  @Post('/invite')
  @ApiOperation({ summary: 'Invite a new user', operationId: 'inviteUser' })
  @ApiResponse({
    status: 200,
    description: 'The user has been successfully invited.',
    type: User,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data.',
  })
  @Auth('users.create')
  async inviteUser(@Body() body: InviteUserDto): Promise<User> {
    return this.invitationService.inviteUser(body);
  }

  @Post('/invite-csv')
  @Auth('users.create')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Invite multiple users from a CSV file', operationId: 'inviteUsersFromCsv' })
  @ApiBody({ type: CsvInviteUploadDto })
  @ApiResponse({
    status: 200,
    description: 'Users have been successfully invited.',
    type: User,
    isArray: true,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid CSV or input data.',
    type: CsvInviteErrorResponseDto,
  })
  async inviteUsersFromCsv(
    @UploadedFile() file: FileUpload | undefined,
    @Body('config') rawConfig: string | CsvInviteConfigDto,
  ): Promise<User[]> {
    return this.invitationService.inviteUsersFromCsv(file, rawConfig);
  }
}
