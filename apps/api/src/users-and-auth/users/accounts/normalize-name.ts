/** The most characters a first or a last name may have. */
export const USER_NAME_MAX_LENGTH = 100;

/** Names are stored trimmed, and a blank name is stored as null. */
export function normalizeUserName(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}
