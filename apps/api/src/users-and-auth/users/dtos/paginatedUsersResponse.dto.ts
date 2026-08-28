import { User } from '@attraccess/database-entities';
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

export class PaginatedUsersResponseDto extends PaginatedResponseWithNextPage<User> {
  @ApiProperty({ type: [User] })
  data: User[];
}
