import { UserDto } from './user.dto';
import { PaginatedResponseWithNextPage } from '../../../types/response';
import { ApiProperty } from '@nestjs/swagger';

export class UserSummaryDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  username: string;
}

export class PaginatedUserSummariesResponseDto extends PaginatedResponseWithNextPage<UserSummaryDto> {
  @ApiProperty({ type: [UserSummaryDto] })
  data: UserSummaryDto[];
}

export class PaginatedUsersResponseDto extends PaginatedResponseWithNextPage<UserDto> {
  @ApiProperty({ type: [UserDto] })
  data: UserDto[];
}
