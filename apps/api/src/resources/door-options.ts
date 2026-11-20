import { BadRequestException } from '@nestjs/common';
import { ResourceType } from '@attraccess/application-models';

export const ACCESS_ONLY_DOORS_ONLY_MESSAGE = 'Access only is available for doors only';
export const ACCESS_ONLY_WITH_SEPARATE_UNLATCH_MESSAGE =
  'An access-only door cannot also use separate unlock and unlatch actions';

/** Checks the door options of a resource as it will be stored, after create or update fields are applied. */
export function assertDoorOptions(resource: {
  type: ResourceType;
  accessOnly?: boolean | null;
  separateUnlockAndUnlatch?: boolean | null;
}): void {
  if (!resource.accessOnly) return;
  if (resource.type !== ResourceType.Door) {
    throw new BadRequestException(ACCESS_ONLY_DOORS_ONLY_MESSAGE);
  }
  if (resource.separateUnlockAndUnlatch) {
    throw new BadRequestException(ACCESS_ONLY_WITH_SEPARATE_UNLATCH_MESSAGE);
  }
}
