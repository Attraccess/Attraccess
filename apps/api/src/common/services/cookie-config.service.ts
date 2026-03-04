import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { SessionConfigType } from '../../config/session.config';
import { SettingsService } from '../../settings/settings.service';

export type CookieConfigType = {
  name: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict';
  maxAge: number;
  path: string;
};

@Injectable()
export class CookieConfigService {
  private readonly cookieName: string = 'auth-session';
  private readonly cookieStaticOptions: Omit<CookieConfigType, 'secure'>;

  constructor(
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
  ) {
    const sessionConfig = this.configService.get<SessionConfigType>('session');

    this.cookieStaticOptions = {
      name: this.cookieName,
      httpOnly: true,
      sameSite: 'strict',
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

  private async isSecure(): Promise<boolean> {
    const url = await this.settingsService.getUrl();
    return url?.startsWith('https://') ?? false;
  }

  /**
   * Sets authentication cookie on the response.
   * The cookie is always SameSite=Strict (safe for SPA same-origin architecture).
   * The `secure` flag is derived from the configured application URL.
   */
  async setAuthCookie(res: Response, token: string): Promise<void> {
    const secure = await this.isSecure();
    res.cookie(this.cookieStaticOptions.name, token, {
      httpOnly: this.cookieStaticOptions.httpOnly,
      secure,
      sameSite: this.cookieStaticOptions.sameSite,
      maxAge: this.cookieStaticOptions.maxAge,
      path: this.cookieStaticOptions.path,
    });
  }

  /**
   * Clears authentication cookie from the response.
   */
  async clearAuthCookie(res: Response): Promise<void> {
    const secure = await this.isSecure();
    res.clearCookie(this.cookieStaticOptions.name, {
      httpOnly: this.cookieStaticOptions.httpOnly,
      secure,
      sameSite: this.cookieStaticOptions.sameSite,
      path: this.cookieStaticOptions.path,
    });
  }
}
