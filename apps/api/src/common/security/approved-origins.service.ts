import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AppConfigType } from '../../config/app.config';
import { SettingsService } from '../../settings/settings.service';

const SETTINGS_RETRY_MS = 5_000;

type RequestAddress = Pick<Request, 'protocol' | 'host'>;

/** Reduces a configured application URL (any path allowed) to its origin. */
export function originOfUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

/** Exact origins only: no wildcards, no path, query or fragment. */
export function parseTrustedOrigins(raw: string | undefined, onInvalid: (entry: string) => void): string[] {
  const origins: string[] = [];
  for (const entry of (raw ?? '').split(',').map((item) => item.trim())) {
    if (!entry) continue;
    let origin: string | null = null;
    if (!entry.includes('*')) {
      try {
        const url = new URL(entry);
        const bare = url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
        if (bare && (url.protocol === 'http:' || url.protocol === 'https:')) origin = url.origin;
      } catch {
        // reported below
      }
    }
    if (origin) origins.push(origin);
    else onInvalid(entry);
  }
  return origins;
}

/** Decides which websites may use a browser session with this API. */
@Injectable()
export class ApprovedOriginsService {
  private readonly logger = new Logger(ApprovedOriginsService.name);
  private readonly configured: ReadonlySet<string>;
  private settingsRetryAt = 0;

  constructor(
    configService: ConfigService,
    private readonly settings: SettingsService,
  ) {
    const config = configService.get<AppConfigType>('app');
    const origins = [
      config?.ATTRACCESS_URL,
      config?.ATTRACCESS_FRONTEND_URL,
      config?.ATTRACCESS_PUBLIC_INTERNET_URL,
    ].map(originOfUrl);
    origins.push(
      ...parseTrustedOrigins(config?.ATTRACCESS_TRUSTED_ORIGINS, (entry) =>
        this.logger.warn(
          `Ignoring invalid ATTRACCESS_TRUSTED_ORIGINS entry "${entry}". Use exact origins such as https://app.example.com.`,
        ),
      ),
    );
    this.configured = new Set(origins.filter((origin): origin is string => Boolean(origin)));
  }

  /**
   * The origin this request was addressed to. Express 5's `host` keeps the port and reads
   * X-Forwarded-Host (like `protocol` reads X-Forwarded-Proto) only when TRUST_PROXY trusts the hop.
   */
  servedOrigin(request: RequestAddress): string | null {
    return request.host ? originOfUrl(`${request.protocol}://${request.host}`) : null;
  }

  async isApproved(origin: string | undefined, request?: RequestAddress): Promise<boolean> {
    if (!origin || origin === 'null') return false;
    if (this.configured.has(origin)) return true;
    if (request && this.servedOrigin(request) === origin) return true;
    return (await this.settingsOrigins()).includes(origin);
  }

  /**
   * The settings store caches these values and refreshes them when they are saved. It does not
   * cache errors, so a failed read backs off briefly instead of hitting the database on every request.
   */
  private async settingsOrigins(): Promise<string[]> {
    if (Date.now() < this.settingsRetryAt) return [];
    try {
      const [url, publicUrl] = await Promise.all([this.settings.getUrl(), this.settings.getPublicInternetUrl()]);
      return [originOfUrl(url), originOfUrl(publicUrl)].filter((origin): origin is string => Boolean(origin));
    } catch (error) {
      // Fail closed for settings-derived origins; the env and served origins still apply.
      this.settingsRetryAt = Date.now() + SETTINGS_RETRY_MS;
      this.logger.error('Could not read the application URLs from Settings', error as Error);
      return [];
    }
  }
}
