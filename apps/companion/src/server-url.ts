// ponytail: default to http:// when the user types a bare host:port, so
// `new URL(path, base)` doesn't throw on input like "localhost:3000".
export function normalizeServerUrl(serverUrl: string): string {
  return /^https?:\/\//i.test(serverUrl) ? serverUrl : `http://${serverUrl}`;
}
