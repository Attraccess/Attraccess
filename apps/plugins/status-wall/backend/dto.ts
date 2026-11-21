import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsInt,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const MAX_SELECTED_IDS = 500;

export class WallSelectionDto {
  @ApiProperty({ type: Boolean, description: 'Show every resource (the lists below are ignored)' })
  @IsBoolean()
  all!: boolean;

  @ApiProperty({ type: [Number], description: 'Specific resources' })
  @IsArray()
  @ArrayMaxSize(MAX_SELECTED_IDS)
  @IsInt({ each: true })
  @Min(1, { each: true })
  resourceIds!: number[];

  @ApiProperty({ type: [Number], description: 'Resource groups: all their resources' })
  @IsArray()
  @ArrayMaxSize(MAX_SELECTED_IDS)
  @IsInt({ each: true })
  @Min(1, { each: true })
  groupIds!: number[];
}

export class WallBody {
  @ApiProperty({ type: String, minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/, { message: 'name must not be blank' })
  name!: string;

  @ApiProperty({ type: WallSelectionDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => WallSelectionDto)
  selection!: WallSelectionDto;
}

export class WallDto {
  @ApiProperty({ type: Number }) id!: number;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String, description: 'Secret of the public link /status-wall/<token>' }) token!: string;
  @ApiProperty({ type: WallSelectionDto }) selection!: WallSelectionDto;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}

export class WallTileDto {
  @ApiProperty({ type: Number }) id!: number;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiProperty({ type: String, enum: ['maintenance', 'in-use', 'ready'] }) state!: 'maintenance' | 'in-use' | 'ready';
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'When the current state began' })
  since!: Date | null;
}

export class WallSnapshotDto {
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String, format: 'date-time' }) generatedAt!: Date;
  @ApiProperty({ type: [WallTileDto] }) tiles!: WallTileDto[];
}
