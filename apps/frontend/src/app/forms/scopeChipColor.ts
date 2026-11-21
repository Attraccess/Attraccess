import { FormScope } from '@attraccess/react-query-client';

/** One colour per scope wherever a form's scope is shown as a chip: inherited forms stand out from a resource's own. */
export function scopeChipColor(scope: FormScope): 'default' | 'accent' {
  return scope === FormScope.RESOURCE ? 'default' : 'accent';
}
