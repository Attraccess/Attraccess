import { AuthRateLimitSettingsDto } from '@attraccess/react-query-client';
import type { RateLimitKey } from './index.rate-limit-key';
import { RATE_LIMIT_NUMBERS } from './index.state';
export function domainsHaveChanged(saved: string[] | undefined, draft: string[] | undefined): boolean {
  if (saved === undefined || draft === undefined) return false;
  return draft.length !== saved.length || draft.some((domain, index) => domain !== saved[index]);
}

export function getRateLimitDraft(
  saved: AuthRateLimitSettingsDto | undefined,
  draft: Partial<AuthRateLimitSettingsDto>,
) {
  const rateValue = (key: RateLimitKey): number => draft[key] ?? saved?.[key] ?? NaN;
  const exponentialBackoff = draft.exponentialBackoff ?? saved?.exponentialBackoff ?? false;
  const isRateDirty =
    !!saved &&
    (RATE_LIMIT_NUMBERS.some((key) => !Object.is(rateValue(key), saved[key])) ||
      !Object.is(rateValue('backoffMultiplier'), saved.backoffMultiplier) ||
      exponentialBackoff !== saved.exponentialBackoff);
  // Clearing a NumberField yields NaN. That is still a departure from the saved value, so the bar
  // stays mounted and Discard stays reachable — only Save is blocked.
  //
  // Integer, not merely finite: the three throttling counters and every policy number are `@IsInt()`
  // on the API, and none of these steppers sets a `step`, so `2.5` is typeable. `Number.isFinite`
  // let it through to a 400 rendered as a generic toast that names no field.
  // `backoffMultiplier` is the one genuine `@IsNumber()`, so it only has to be finite and >= 1.
  const isRateSavable =
    RATE_LIMIT_NUMBERS.every((key) => Number.isInteger(rateValue(key)) && rateValue(key) >= 1) &&
    Number.isFinite(rateValue('backoffMultiplier')) &&
    rateValue('backoffMultiplier') >= 1;
  return { value: rateValue, exponentialBackoff, isDirty: isRateDirty, isSavable: isRateSavable };
}
export /**
 * A break between groups of rows. Four concerns share one section, and without a marker the
 * password-policy switches read as more login-throttling switches — the grouping is the only thing
 * that says which backend a row belongs to.
 */
function SubHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-xs text-muted">{description}</p>
    </div>
  );
}
