import { BadRequestException } from '@nestjs/common';
import { ResourceType } from '@attraccess/application-models';
import {
  ACCESS_ONLY_DOORS_ONLY_MESSAGE,
  ACCESS_ONLY_WITH_SEPARATE_UNLATCH_MESSAGE,
  assertDoorOptions,
} from './door-options';

describe('assertDoorOptions', () => {
  it.each([
    { type: ResourceType.Door, accessOnly: true, separateUnlockAndUnlatch: false },
    { type: ResourceType.Door, accessOnly: false, separateUnlockAndUnlatch: true },
    { type: ResourceType.Machine, accessOnly: false, separateUnlockAndUnlatch: true },
  ])('accepts %o', (options) => {
    expect(() => assertDoorOptions(options)).not.toThrow();
  });

  it('refuses access only on a machine', () => {
    expect(() =>
      assertDoorOptions({ type: ResourceType.Machine, accessOnly: true, separateUnlockAndUnlatch: false }),
    ).toThrow(new BadRequestException(ACCESS_ONLY_DOORS_ONLY_MESSAGE));
  });

  it('refuses access only together with separate unlock and unlatch', () => {
    expect(() =>
      assertDoorOptions({ type: ResourceType.Door, accessOnly: true, separateUnlockAndUnlatch: true }),
    ).toThrow(new BadRequestException(ACCESS_ONLY_WITH_SEPARATE_UNLATCH_MESSAGE));
  });
});
