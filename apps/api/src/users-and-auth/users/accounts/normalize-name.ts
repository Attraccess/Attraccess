/** The most characters (code points) a first or a last name may have. */
export const USER_NAME_MAX_LENGTH = 100;

/** Control characters (`\p{Cc}`: NUL, tab, line breaks, escape …). PostgreSQL cannot store NUL in text. */
const CONTROL_CHARACTERS = /\p{Cc}/u;

/** Names are stored trimmed, and a blank name is stored as null. */
export function normalizeUserName(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/** Why a (normalized) name cannot be stored, as the CSV row errors name it; null when it can. */
export type UserNameProblem = 'INVALID' | 'TOO_LONG';

/** The one rule every name input (forms, invites, CSV) is checked against; SSO names are cut to fit it instead. */
export function userNameProblem(name: string): UserNameProblem | null {
  if (CONTROL_CHARACTERS.test(name)) return 'INVALID';
  if (Array.from(name).length > USER_NAME_MAX_LENGTH) return 'TOO_LONG';
  return null;
}

/**
 * A name from an outside source (an identity provider) made storable: control characters removed, trimmed, cut to
 * `USER_NAME_MAX_LENGTH` code points (never in the middle of a surrogate pair) and trimmed again, so storing and
 * normalizing it once more yields the same value. Blank yields null.
 */
export function toStorableUserName(value: string): string | null {
  const cleaned = normalizeUserName(value.replace(/\p{Cc}/gu, ''));
  if (cleaned === null) return null;
  return normalizeUserName(Array.from(cleaned).slice(0, USER_NAME_MAX_LENGTH).join(''));
}
