import { User } from '@attraccess/database-entities';
import { PaginatedResponseWithNextPage } from '../../../types/response';
import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';

export class UserSummaryDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  username: string;
}

@ApiExtraModels(UserSummaryDto)
export class PaginatedUsersResponseDto extends PaginatedResponseWithNextPage<User | UserSummaryDto> {
  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [{ $ref: getSchemaPath(User) }, { $ref: getSchemaPath(UserSummaryDto) }],
    },
  })
  data: Array<User | UserSummaryDto>;
}
