import { ApiProperty } from '@nestjs/swagger';

export class CanManageMaintenanceResponseDto {
  @ApiProperty({
    description: 'Whether the user can manage maintenance for the resource',
    example: true,
  })
  canManage: boolean;

  @ApiProperty({
    description: 'The resource ID that was checked',
    example: 123,
  })
  resourceId: number;
}
