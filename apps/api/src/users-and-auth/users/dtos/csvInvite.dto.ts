import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { User } from '@attraccess/database-entities';

export class CsvInviteConfigDto {
  @ApiProperty({ description: 'CSV column header containing the email' })
  @IsString()
  emailKey!: string;

  @ApiProperty({ description: 'CSV column header containing the username' })
  @IsString()
  usernameKey!: string;

  @ApiProperty({
    required: false,
    type: [Number],
    description: '1-based row numbers (excluding header) to skip when importing',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  ignoredRows?: number[];
}

export class CsvInviteRowErrorDto {
  @ApiProperty({ description: '1-based row number (excluding header)' })
  row!: number;

  @ApiProperty({ required: false })
  field?: string;

  @ApiProperty()
  message!: string;

  @ApiProperty({ required: false })
  value?: string;
}

export class CsvInviteErrorResponseDto {
  @ApiProperty({ default: 'CSV import failed' })
  message!: string;

  @ApiProperty({ type: [CsvInviteRowErrorDto] })
  errors!: CsvInviteRowErrorDto[];
}

export class CsvInviteSuccessResponseDto {
  @ApiProperty({ type: [User] })
  users!: User[];
}

export class CsvInviteUploadDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  file!: string;

  @ApiProperty({
    description: 'JSON string or object describing how to map CSV columns to fields',
    type: () => CsvInviteConfigDto,
  })
  config!: CsvInviteConfigDto;
}
