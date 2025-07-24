import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AppConfigType } from '../../config/app.config';
import { SessionConfigType } from '../../config/session.config';

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
  private readonly cookieConfig: CookieConfigType;

  constructor(private readonly configService: ConfigService) {
    this.cookieConfig = this.getCookieConfig();
  }

  /**
   * Gets cookie configuration based on environment
   */
  private getCookieConfig(): CookieConfigType {
    const appConfig = this.configService.get<AppConfigType>('app');
    const sessionConfig = this.configService.get<SessionConfigType>('session');
    const isSecure = appConfig?.ATTRACCESS_URL?.startsWith('https://') ?? false;

    return {
      name: 'auth-session',
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax' as const,
      maxAge: sessionConfig.SESSION_COOKIE_MAX_AGE,
      path: '/',
    };
  }

  /**
   * Get the current cookie configuration
   */
  getConfig(): CookieConfigType {
    return this.cookieConfig;
  }

  /**
   * Sets authentication cookie on the response
   */
  setAuthCookie(res: Response, token: string): void {
    res.cookie(this.cookieConfig.name, token, {
      httpOnly: this.cookieConfig.httpOnly,
      secure: this.cookieConfig.secure,
      sameSite: this.cookieConfig.sameSite,
      maxAge: this.cookieConfig.maxAge,
      path: this.cookieConfig.path,
    });
  }

  /**
   * Clears authentication cookie from the response
   */
  clearAuthCookie(res: Response): void {
    res.clearCookie(this.cookieConfig.name, {
      httpOnly: this.cookieConfig.httpOnly,
      secure: this.cookieConfig.secure,
      sameSite: this.cookieConfig.sameSite,
      path: this.cookieConfig.path,
    });
  }
}
