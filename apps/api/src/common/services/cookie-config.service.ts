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
  private readonly cookieName: string = 'auth-session';
  private readonly cookieStaticOptions: Omit<CookieConfigType, 'secure' | 'sameSite'>;

  constructor(
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
  ) {
    const sessionConfig = this.configService.get<SessionConfigType>('session');

    this.cookieStaticOptions = {
      name: this.cookieName,
      httpOnly: true,
      maxAge: sessionConfig.SESSION_COOKIE_MAX_AGE,
      path: '/',
    };
  }

  /**
   * Returns the name of the auth session cookie.
   * Use this to look up the cookie value from an incoming request.
   */
  getCookieName(): string {
    return this.cookieName;
  }

  private async getCookieOptions(): Promise<Pick<CookieConfigType, 'secure' | 'sameSite'>> {
    const [url, sameSite] = await Promise.all([
      this.settingsService.getUrl(),
      this.settingsService.getCookieSameSite(),
    ]);
    return deriveCookieSecurity(url, sameSite);
  }

  /**
   * Sets authentication cookie on the response.
   * secure and sameSite are derived from the configured URL and SameSite policy setting.
   */
  async setAuthCookie(res: Response, token: string): Promise<void> {
    const { secure, sameSite } = await this.getCookieOptions();
    res.cookie(this.cookieStaticOptions.name, token, {
      httpOnly: this.cookieStaticOptions.httpOnly,
      secure,
      sameSite,
      maxAge: this.cookieStaticOptions.maxAge,
      path: this.cookieStaticOptions.path,
    });
  }

  /**
   * Clears authentication cookie from the response.
   */
  async clearAuthCookie(res: Response): Promise<void> {
    const { secure, sameSite } = await this.getCookieOptions();
    res.clearCookie(this.cookieStaticOptions.name, {
      httpOnly: this.cookieStaticOptions.httpOnly,
      secure,
      sameSite,
      path: this.cookieStaticOptions.path,
    });
  }
}
