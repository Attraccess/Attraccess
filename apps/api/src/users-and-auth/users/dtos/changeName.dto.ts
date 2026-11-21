import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, ValidateIf } from 'class-validator';
import { USER_NAME_MAX_LENGTH } from '../accounts/normalize-name';

const trimString = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ChangeNameDto {
  @ApiProperty({ type: String, nullable: true, maxLength: USER_NAME_MAX_LENGTH, example: 'Ada' })
  @Transform(trimString)
  // null clears the name; a missing key is refused so a partial body cannot wipe the other name.
  @ValidateIf((_dto, value) => value !== null)
  @IsString()
  @MaxLength(USER_NAME_MAX_LENGTH)
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true, maxLength: USER_NAME_MAX_LENGTH, example: 'Lovelace' })
  @Transform(trimString)
  // null clears the name; a missing key is refused so a partial body cannot wipe the other name.
  @ValidateIf((_dto, value) => value !== null)
  @IsString()
  @MaxLength(USER_NAME_MAX_LENGTH)
  lastName!: string | null;
}
