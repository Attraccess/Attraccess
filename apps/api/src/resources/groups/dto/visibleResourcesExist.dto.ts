import { ApiProperty } from '@nestjs/swagger';

export class VisibleResourcesExistDto {
  @ApiProperty({ description: 'Whether an ungrouped resource or a resource in a group visible to this user exists' })
  hasResources!: boolean;
}
