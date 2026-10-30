import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AppConfigType } from '../../config/app.config';
import { SettingsService } from '../../settings/settings.service';

const SETTINGS_CACHE_MS = 60_000;

type RequestAddress = Pick<Request, 'protocol' | 'get'> & Partial<Pick<Request, 'app' | 'socket'>>;

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
  private settingsCache: { expiresAt: number; origins: string[] } | null = null;

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

  /** The origin this request was addressed to (honours the trust-proxy setting). */
  servedOrigin(request: RequestAddress): string | null {
    const host = this.servedHost(request);
    return host ? originOfUrl(`${request.protocol}://${host}`) : null;
  }

  /**
   * Express' own `hostname` drops the port, so the forwarded host is read here under the
   * same rule: only when the connecting hop is trusted through TRUST_PROXY.
   */
  private servedHost(request: RequestAddress): string | undefined {
    const forwarded = request.get('x-forwarded-host');
    const trusted = request.app?.get('trust proxy fn') as
      ((address: string | undefined, hop: number) => boolean) | undefined;
    if (forwarded && trusted?.(request.socket?.remoteAddress, 0)) return forwarded.split(',')[0].trim();
    return request.get('host');
  }

  async isApproved(origin: string | undefined, request?: RequestAddress): Promise<boolean> {
    if (!origin || origin === 'null') return false;
    if (this.configured.has(origin)) return true;
    if (request && this.servedOrigin(request) === origin) return true;
    return (await this.settingsOrigins()).includes(origin);
  }

  private async settingsOrigins(): Promise<string[]> {
    const now = Date.now();
    if (this.settingsCache && this.settingsCache.expiresAt > now) return this.settingsCache.origins;
    let origins: string[] = [];
    try {
      const [url, publicUrl] = await Promise.all([this.settings.getUrl(), this.settings.getPublicInternetUrl()]);
      origins = [originOfUrl(url), originOfUrl(publicUrl)].filter((origin): origin is string => Boolean(origin));
    } catch (error) {
      // Fail closed for settings-derived origins; the env and served origins still apply.
      this.logger.error('Could not read the application URLs from Settings', error as Error);
    }
    this.settingsCache = { expiresAt: now + SETTINGS_CACHE_MS, origins };
    return origins;
  }
}
