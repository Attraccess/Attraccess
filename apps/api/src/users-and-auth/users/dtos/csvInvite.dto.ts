import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { User } from '@attraccess/database-entities';

export class CsvInvitePermissionMappingDto {
  @ApiProperty({ description: 'CSV column header that maps to this permission' })
  @IsString()
  keyMapping!: string;

  @ApiProperty({ description: 'CSV value that represents a YES for this permission' })
  @IsString()
  yesValue!: string;
}

export class CsvInvitePermissionsDto {
  @ApiProperty({ type: () => CsvInvitePermissionMappingDto })
  @ValidateNested()
  @Type(() => CsvInvitePermissionMappingDto)
  canManageResources!: CsvInvitePermissionMappingDto;

  @ApiProperty({ type: () => CsvInvitePermissionMappingDto })
  @ValidateNested()
  @Type(() => CsvInvitePermissionMappingDto)
  canManageSystemConfiguration!: CsvInvitePermissionMappingDto;

  @ApiProperty({ type: () => CsvInvitePermissionMappingDto })
  @ValidateNested()
  @Type(() => CsvInvitePermissionMappingDto)
  canManageUsers!: CsvInvitePermissionMappingDto;

  @ApiProperty({ type: () => CsvInvitePermissionMappingDto })
  @ValidateNested()
  @Type(() => CsvInvitePermissionMappingDto)
  canManageBilling!: CsvInvitePermissionMappingDto;
}

export class CsvInviteConfigDto {
  @ApiProperty({ description: 'CSV column header containing the email' })
  @IsString()
  emailKey!: string;

  @ApiProperty({ description: 'CSV column header containing the username' })
  @IsString()
  usernameKey!: string;

  @ApiProperty({ type: () => CsvInvitePermissionsDto })
  @ValidateNested()
  @Type(() => CsvInvitePermissionsDto)
  permissions!: CsvInvitePermissionsDto;

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
