import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '@attraccess/database-entities';
import { ForbiddenSignupDomainException } from './errors/forbiddenSignupDomain.exception';

/**
 * Owns the local-signup domain whitelist setting and the derived signup checks.
 */
@Injectable()
export class SignupDomainService {
  constructor(
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
  ) {}

  public async getWhitelist(): Promise<string[]> {
    const localSignupDomainWhitelist = await this.settingRepository.findOne({
      where: {
        parent: 'auth',
        key: 'local_signup_domain_whitelist',
      },
    });

    return (localSignupDomainWhitelist?.value ?? '*')
      .split(',')
      .map((domain) => domain.trim().toLowerCase())
      .filter((domain) => domain !== '');
  }

  public async setWhitelist(domains: string[]): Promise<void> {
    await this.settingRepository.update(
      {
        parent: 'auth',
        key: 'local_signup_domain_whitelist',
      },
      { value: domains.join(',') },
    );
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
