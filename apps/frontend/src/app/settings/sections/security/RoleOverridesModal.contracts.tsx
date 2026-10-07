import { PasswordPolicyOverrideDto } from '@attraccess/react-query-client';
import { PasswordPolicyDto } from '@attraccess/react-query-client';
import { PasswordPolicyRole } from '@attraccess/react-query-client';
export /** `null` is a real value here — "inherit" — so an untouched field is `undefined`, not `null`. */
type OverrideDraft = Partial<Record<string, number | boolean | null>>;

export type OverrideKey = keyof PasswordPolicyOverrideDto;
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export interface Props {
  role: PasswordPolicyRole | null;
  existing: PasswordPolicyOverrideDto | undefined;
  globalPolicy: PasswordPolicyDto;
  t: Translate;
  onClose: () => void;
}
