// Payloads over the recorder's limit arrive truncated, so they are no longer valid JSON.
export function prettyPayload(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
