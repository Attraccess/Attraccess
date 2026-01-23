import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional } from 'class-validator';

export class UpdateUsageSessionProjectDto {
  @ApiProperty({
    description: 'The project to assign this usage session to. Set to null to clear the assignment.',
    required: false,
    nullable: true,
    example: 35,
  })
  @IsOptional()
  @IsInt()
  projectId?: number | null;
}
