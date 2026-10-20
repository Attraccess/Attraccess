/** Exact browser origins only. Never derive trust from request or proxy headers. */
export function parseBrowserOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      value.includes('*')
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value.split(',').map((entry) => {
    const origin = parseBrowserOrigin(entry.trim());
    if (!origin) throw new Error('ATTRACCESS_ALLOWED_ORIGINS must contain exact HTTP(S) origins');
    return origin;
  });
}

export class BrowserOriginPolicy {
  constructor(private readonly configuredOrigins: () => Promise<readonly (string | null | undefined)[]>) {}

  async allows(origin: string): Promise<boolean> {
    // Origin headers themselves cannot contain a path, credentials, or multiple origins.
    const parsed = parseBrowserOrigin(origin);
    if (!parsed || origin !== parsed) return false;
    return (await this.configuredOrigins()).some((value) => value && parseBrowserOrigin(value) === parsed);
  }
}

/** Application URLs may have a base path; allowlist entries remain exact origins. */
export function applicationBrowserOrigin(value: string | null | undefined): string | null {
  try {
    const url = new URL(value ?? '');
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.origin : null;
  } catch {
    return null;
  }
}
