import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { SessionConfigType } from '../../config/session.config';
import { SettingsService } from '../../settings/settings.service';
import { deriveCookieSecurity } from './cookie-security';

export type CookieConfigType = {
  name: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  maxAge: number;
  path: string;
};

@Injectable()
export class CookieConfigService {
  private readonly cookieConfig: Omit<CookieConfigType, 'secure' | 'sameSite'>;

  constructor(
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
  ) {
    const sessionConfig = this.configService.get<SessionConfigType>('session');
    this.cookieConfig = {
      name: 'auth-session',
      httpOnly: true,
      maxAge: sessionConfig.SESSION_COOKIE_MAX_AGE,
      path: '/',
    };
  }

  /**
   * Get the current cookie configuration (static options only; secure and sameSite are derived per-request from DB settings).
   */
  getConfig(): CookieConfigType {
    return {
      ...this.cookieConfig,
      sameSite: 'lax',
      secure: false,
    };
  }

  private async getCookieOptions(): Promise<Pick<CookieConfigType, 'secure' | 'sameSite'>> {
    const [frontendUrl, backendUrl] = await Promise.all([
      this.settingsService.getFrontendUrl(),
      this.settingsService.getBackendUrl(),
    ]);
    return deriveCookieSecurity(frontendUrl, backendUrl);
  }

  /**
   * Sets authentication cookie on the response. secure and sameSite are derived from configured frontend and backend URLs.
   */
  async setAuthCookie(res: Response, token: string): Promise<void> {
    const { secure, sameSite } = await this.getCookieOptions();
    res.cookie(this.cookieConfig.name, token, {
      httpOnly: this.cookieConfig.httpOnly,
      secure,
      sameSite,
      maxAge: this.cookieConfig.maxAge,
      path: this.cookieConfig.path,
    });
  }

  /**
   * Clears authentication cookie from the response. secure and sameSite must match the values used when the cookie was set.
   */
  async clearAuthCookie(res: Response): Promise<void> {
    const { secure, sameSite } = await this.getCookieOptions();
    res.clearCookie(this.cookieConfig.name, {
      httpOnly: this.cookieConfig.httpOnly,
      secure,
      sameSite,
      path: this.cookieConfig.path,
    });
  }
}
