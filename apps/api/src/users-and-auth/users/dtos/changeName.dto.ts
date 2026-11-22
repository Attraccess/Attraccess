import { ApiProperty } from '@nestjs/swagger';
import { USER_NAME_MAX_LENGTH } from '../accounts/normalize-name';
import { UserNameInput } from './user-name-input.decorator';

export class ChangeNameDto {
  @ApiProperty({ type: String, nullable: true, maxLength: USER_NAME_MAX_LENGTH, example: 'Ada' })
  // null (or blank) clears the name; a missing key is refused so a partial body cannot wipe the other name.
  @UserNameInput({ required: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true, maxLength: USER_NAME_MAX_LENGTH, example: 'Lovelace' })
  @UserNameInput({ required: true })
  lastName!: string | null;
}
