import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { MaintenanceRequestStatus } from '@attraccess/database-entities';

export class ListMaintenanceRequestsDto {
  @ApiProperty({ description: 'Page number for pagination', required: false, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ description: 'Number of items per page', required: false, example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiProperty({
    description: 'Filter by request status (defaults to open requests only)',
    required: false,
    enum: MaintenanceRequestStatus,
    enumName: 'MaintenanceRequestStatus',
  })
  @IsOptional()
  @IsEnum(MaintenanceRequestStatus)
  status?: MaintenanceRequestStatus;
}
