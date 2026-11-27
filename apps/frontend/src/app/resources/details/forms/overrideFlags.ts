import type { FormResourceOverrideDto, ResourceApplicableFormDto } from '@attraccess/react-query-client';

/** The usage actions a form can be required at, with their flag on the form and on an override. */
export const OVERRIDE_FLAGS = [
  ['start', 'isRequiredOnResourceUsageStart'],
  ['takeover', 'isRequiredOnResourceUsageTakeOver'],
  ['end', 'isRequiredOnResourceUsageEnd'],
  ['projectSwitch', 'isRequiredOnResourceUsageProjectSwitch'],
] as const;
export type OverrideAction = (typeof OVERRIDE_FLAGS)[number][0];
export type OverrideFlag = (typeof OVERRIDE_FLAGS)[number][1];
export type OverrideChoice = 'inherit' | 'required' | 'notRequired';

export const toChoice = (value: boolean | null | undefined): OverrideChoice =>
  value === null || value === undefined ? 'inherit' : value ? 'required' : 'notRequired';
export const fromChoice = (choice: OverrideChoice): boolean | null =>
  choice === 'inherit' ? null : choice === 'required';

/** The resource's override of a form, or one that inherits everything. */
export function currentOverride(item: ResourceApplicableFormDto): FormResourceOverrideDto {
  return (
    item.override ?? {
      disabled: false,
      isRequiredOnResourceUsageStart: null,
      isRequiredOnResourceUsageTakeOver: null,
      isRequiredOnResourceUsageEnd: null,
      isRequiredOnResourceUsageProjectSwitch: null,
    }
  );
}

/** An override that changes nothing is removed instead of stored. */
export const inheritsEverything = (override: FormResourceOverrideDto) =>
  !override.disabled && OVERRIDE_FLAGS.every(([, flag]) => override[flag] === null);
