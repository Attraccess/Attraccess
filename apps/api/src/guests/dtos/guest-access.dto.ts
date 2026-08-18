import { ApiProperty } from '@nestjs/swagger';

export class GuestAccessEntryDto {
  @ApiProperty({ description: 'The unique identifier of the introduction', example: 7 })
  introductionId: number;

  @ApiProperty({
    description: 'Whether the access is to a single resource or a resource group',
    enum: ['resource', 'group'],
    example: 'resource',
  })
  type: 'resource' | 'group';

  @ApiProperty({ description: 'The ID of the resource or resource group', example: 3 })
  targetId: number;

  @ApiProperty({ description: 'The name of the resource or resource group', example: 'Laser Cutter' })
  targetName: string;

  @ApiProperty({ description: 'Whether the introduction is currently valid (last action was a grant)', example: true })
  valid: boolean;
}

export class GuestAccessDto {
  @ApiProperty({ type: [GuestAccessEntryDto] })
  entries: GuestAccessEntryDto[];
}
