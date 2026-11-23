/** The one form a card UID is compared in: lowercase hex, as the readers send it. */
export const normalizeCardUid = (uid: string): string => uid.toLowerCase();

/**
 * A 4-byte UID that starts with 0x08 is a random UID (phones, bank cards): it changes with every tap,
 * so it cannot identify a card.
 */
export const isRandomUid = (uid: string): boolean => {
  const normalized = normalizeCardUid(uid);
  return normalized.length === 8 && normalized.startsWith('08');
};
