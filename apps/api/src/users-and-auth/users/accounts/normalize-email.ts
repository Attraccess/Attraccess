/** Emails are stored trimmed and lowercased so uniqueness and lookups are case-insensitive. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
