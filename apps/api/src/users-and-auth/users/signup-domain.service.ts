import { Inject, Injectable } from '@nestjs/common';
import { SETTINGS_ROWS, type SettingsRows } from '../../settings/settings-rows.port';
import { ForbiddenSignupDomainException } from './errors/forbiddenSignupDomain.exception';

const SETTING_PARENT = 'auth';
const SETTING_KEY = 'local_signup_domain_whitelist';

/**
 * Owns the local-signup domain whitelist setting and the derived signup checks.
 */
@Injectable()
export class SignupDomainService {
  constructor(@Inject(SETTINGS_ROWS) private readonly settings: SettingsRows) {}

  public async getWhitelist(): Promise<string[]> {
    const stored = await this.settings.findValue(SETTING_PARENT, SETTING_KEY);

    return (stored ?? '*')
      .split(',')
      .map((domain) => domain.trim().toLowerCase())
      .filter((domain) => domain !== '');
  }

  public async setWhitelist(domains: string[]): Promise<void> {
    await this.settings.upsertValue(SETTING_PARENT, SETTING_KEY, domains.join(','));
  }

  public async isLocalSignupEnabled(): Promise<boolean> {
    const whitelist = await this.getWhitelist();
    return whitelist.length > 0;
  }

  /**
   * Throws {@link ForbiddenSignupDomainException} when the email's domain is not
   * covered by the whitelist. A whitelist containing '*' allows every domain.
   */
  public async assertEmailDomainAllowed(email: string): Promise<void> {
    const signupDomainWhitelist = await this.getWhitelist();

    if (signupDomainWhitelist.includes('*')) {
      return;
    }

    const emailDomain = email.split('@').pop().toLowerCase();

    if (!signupDomainWhitelist.includes(emailDomain)) {
      throw new ForbiddenSignupDomainException(emailDomain);
    }
  }
}
