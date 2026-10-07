import { AuthenticationDetail, Setting, User } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { EncryptionService } from '../../encryption/encryption.service';
import { MetricsService } from '../../metrics/metrics.service';

export abstract class TwoFactorServiceRouteContext {
  protected abstract readonly settingRepository: Repository<Setting>;
  protected abstract readonly policyParent: 'auth';
  protected abstract readonly policyKey: 'two_factor_policy';
  protected abstract getTwoFactorDetail(userId: number): Promise<AuthenticationDetail | null>;
  protected abstract loadOtplib(): Promise<typeof import('otplib')>;
  protected abstract resolveIssuer(): Promise<string>;
  protected abstract readonly encryptionService: EncryptionService;
  protected abstract readonly authenticationDetailRepository: Repository<AuthenticationDetail>;
  protected abstract readonly metricsService: MetricsService;
  protected abstract resolveTotpSecret(detail: AuthenticationDetail): string | null;
  protected abstract isCodeValid(secret: string, code: string): Promise<boolean>;
  protected abstract isPrivilegedUser(user: User): boolean;
  protected abstract readonly logger: Logger;
}
