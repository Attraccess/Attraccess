import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const MAX_SELECTED_IDS = 200;

export class IcalSelectionDto {
  @ApiProperty({ type: [Number], description: 'Specific resources (only those you may see are included)' })
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

  @ApiProperty({ type: Boolean, description: 'All resources you are introduced to' })
  @IsBoolean()
  introduced!: boolean;

  @ApiProperty({ type: Boolean, description: 'All resources you maintain' })
  @IsBoolean()
  maintained!: boolean;

  @ApiProperty({ type: Boolean, description: 'Only your own bookings (alone: across every resource)' })
  @IsBoolean()
  ownOnly!: boolean;
}

export class CreateIcalFeedBody {
  @ApiProperty({ type: String, minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/, { message: 'name must not be blank' })
  name!: string;

  @ApiProperty({ type: IcalSelectionDto, description: 'At least one selector must be set' })
  @IsDefined()
  @ValidateNested()
  @Type(() => IcalSelectionDto)
  selection!: IcalSelectionDto;
}

export class UpdateIcalFeedBody {
  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/, { message: 'name must not be blank' })
  name?: string;

  @ApiPropertyOptional({ type: IcalSelectionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => IcalSelectionDto)
  selection?: IcalSelectionDto;
}

export class IcalFeedDto {
  @ApiProperty({ type: Number })
  id!: number;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: IcalSelectionDto })
  selection!: IcalSelectionDto;

  @ApiProperty({ type: String, nullable: true, description: 'First characters of the token, to recognise the feed' })
  tokenPrefix!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastUsedAt!: string | null;
}

export class IcalFeedSecretDto {
  @ApiProperty({ type: IcalFeedDto })
  feed!: IcalFeedDto;

  @ApiProperty({
    type: String,
    description:
      'Subscription URL (absolute when the application URL is configured, otherwise a path). Shown only now.',
  })
  url!: string;

  @ApiProperty({ type: String, description: 'The secret token inside the URL. Shown only now; never stored.' })
  token!: string;
}
