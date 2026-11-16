import { useFormatedDuration } from '@attraccess/plugins-frontend-ui';
import { MISSING_VALUE } from './format';

// A localized duration (whole minutes) or the missing-value placeholder.
export function Duration({ ms }: { ms: number | null }) {
  const formatted = useFormatedDuration(ms == null ? 0 : Math.floor(ms / 60_000));
  return <>{ms == null ? MISSING_VALUE : formatted}</>;
}
