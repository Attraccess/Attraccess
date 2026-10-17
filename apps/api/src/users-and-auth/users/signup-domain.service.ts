import { Injectable } from '@nestjs/common';
import { SignupDomainPersistence } from './persistence/port';
import { ForbiddenSignupDomainException } from './errors/forbiddenSignupDomain.exception';

/**
 * Owns the local-signup domain whitelist setting and the derived signup checks.
 */
@Injectable()
export class SignupDomainService {
  constructor(private readonly persistence: SignupDomainPersistence) {}

  public async getWhitelist(): Promise<string[]> {
    const value = await this.persistence.readWhitelist();
    return (value ?? '*')
      .split(',')
      .map((domain) => domain.trim().toLowerCase())
      .filter((domain) => domain !== '');
  }

  public async setWhitelist(domains: string[]): Promise<void> {
    await this.persistence.updateWhitelist(domains.join(','));
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
