import { PasswordPolicyDto } from '@attraccess/react-query-client';

/** A policy field: the unsaved draft when edited, otherwise the saved value. */
export function policyValue<K extends keyof PasswordPolicyDto>(
  policy: PasswordPolicyDto | undefined,
  draft: Partial<PasswordPolicyDto>,
  key: K,
): PasswordPolicyDto[K] {
  return (draft[key] ?? policy?.[key]) as PasswordPolicyDto[K];
}
