import { User } from '@attraccess/database-entities';
import { PaginatedResponseWithNextPage } from '../../../types/response';
import { ApiProperty } from '@nestjs/swagger';

export class PaginatedUsersResponseDto extends PaginatedResponseWithNextPage<User> {
  @ApiProperty({ type: [User] })
  data: User[];
}
