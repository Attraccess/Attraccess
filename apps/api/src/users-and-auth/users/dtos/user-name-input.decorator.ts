import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, ValidateBy, ValidateIf } from 'class-validator';
import { normalizeUserName, USER_NAME_MAX_LENGTH, userNameProblem } from '../accounts/normalize-name';

/** Rejects a name with control characters or more than `USER_NAME_MAX_LENGTH` characters (`userNameProblem`). */
function IsStorableUserName(): PropertyDecorator {
  return ValidateBy({
    name: 'isStorableUserName',
    validator: {
      validate: (value: unknown) => typeof value === 'string' && userNameProblem(value) === null,
      defaultMessage: () => `$property must have at most ${USER_NAME_MAX_LENGTH} characters and no control characters`,
    },
  });
}

/**
 * Validation of a first or last name input: trimmed, blank becomes null, then at most `USER_NAME_MAX_LENGTH`
 * characters without control characters. `required` refuses a missing key (null still clears the name), so a partial
 * body cannot wipe a name; otherwise a missing name is fine. The swagger `@ApiProperty` stays on the field.
 */
export function UserNameInput({ required }: { required: boolean }): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }) => (typeof value === 'string' ? normalizeUserName(value) : value)),
    ValidateIf((_dto, value) => (required ? value !== null : value !== null && value !== undefined)),
    IsString(),
    IsStorableUserName(),
  );
}
