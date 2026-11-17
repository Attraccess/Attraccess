// The encrypted backup file in `plugin_matter_backups.blob`. The neutral schema has no binary type, so new rows hold
// the file as base64 text. Rows written by 1.x hold the raw bytes (a `blob` column); reading accepts both.

export function encodeBlob(file: Buffer): string {
  return file.toString('base64');
}

/** The file of a stored value, or null when the column holds nothing usable. */
export function decodeBlob(stored: unknown): Buffer | null {
  if (typeof stored === 'string') return stored === '' ? null : Buffer.from(stored, 'base64');
  if (stored instanceof Uint8Array) return stored.byteLength === 0 ? null : Buffer.from(stored);
  return null;
}
