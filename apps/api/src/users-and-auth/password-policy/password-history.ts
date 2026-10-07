import { AuthenticationType } from '@attraccess/database-entities';
import { COMMON_PASSWORDS, PasswordUserContext, PolicyError, validatePassword } from '@attraccess/shared';
import * as bcrypt from 'bcrypt';
import { PasswordPolicyOverridesImplementation } from './password-policy-overrides';
import { ServerValidationResult, ValidateOptions } from './password-policy.service.feature-definitions';
export abstract class PasswordHistoryImplementation extends PasswordPolicyOverridesImplementation {
  public async validate(
    password: string,
    userCtx: PasswordUserContext = {},
    options: ValidateOptions = {},
  ): Promise<ServerValidationResult> {
    const policy = options.policyOverride ?? (await this.getEffectivePolicy(options.role));
    const baseResult = validatePassword(password, policy, userCtx, { commonPasswords: COMMON_PASSWORDS });
    const errors: PolicyError[] = [...baseResult.errors];

    const zxcvbnInputs = [userCtx.username, userCtx.email].filter(
      (v): v is string => typeof v === 'string' && v.length > 0,
    );
    const zxcvbnResult = this.zxcvbn.evaluate(password, zxcvbnInputs);
    if (zxcvbnResult.score < policy.minZxcvbnScore) {
      errors.push({
        code: 'ZXCVBN_SCORE',
        params: { score: zxcvbnResult.score, required: policy.minZxcvbnScore },
      });
    }

    if (policy.checkHIBP) {
      const hibp = await this.hibp.check(password);
      if (hibp.pwned) {
        errors.push({ code: 'HIBP_PWNED', params: { count: hibp.count } });
      }
    }

    if (policy.historySize > 0 && options.userIdForHistory) {
      const reused = await this.matchesRecentHistory(options.userIdForHistory, password, policy.historySize);
      if (reused) {
        errors.push({ code: 'PASSWORD_REUSED', params: { historySize: policy.historySize } });
      }
    }

    return {
      ok: errors.length === 0,
      errors,
      zxcvbn: { score: zxcvbnResult.score, required: policy.minZxcvbnScore },
    };
  }

  public async recordHistory(userId: number, passwordHash: string): Promise<void> {
    const policy = await this.getPolicy();
    if (policy.historySize <= 0 || !passwordHash) {
      return;
    }

    await this.historyRepo.save(this.historyRepo.create({ userId, passwordHash }));
    await this.pruneHistory(userId, policy.historySize);
  }

  public async archiveCurrentPasswordToHistory(userId: number): Promise<void> {
    const policy = await this.getPolicy();
    if (policy.historySize <= 0) {
      return;
    }

    const currentDetail = await this.authDetailRepo.findOne({
      where: { userId, type: AuthenticationType.LOCAL_PASSWORD },
    });
    if (!currentDetail?.password) {
      return;
    }

    await this.recordHistory(userId, currentDetail.password);
  }

  protected async matchesRecentHistory(userId: number, candidate: string, historySize: number): Promise<boolean> {
    const currentDetail = await this.authDetailRepo.findOne({
      where: { userId, type: AuthenticationType.LOCAL_PASSWORD },
    });
    if (currentDetail?.password && (await bcrypt.compare(candidate, currentDetail.password))) {
      return true;
    }

    const priorEntries = await this.historyRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: historySize,
    });

    for (const entry of priorEntries) {
      if (await bcrypt.compare(candidate, entry.passwordHash)) {
        return true;
      }
    }

    return false;
  }

  protected async pruneHistory(userId: number, historySize: number): Promise<void> {
    const keep = await this.historyRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: historySize,
      select: ['id'],
    });
    const keepIds = keep.map((row) => row.id);
    const builder = this.historyRepo.createQueryBuilder().delete().where('userId = :userId', { userId });
    if (keepIds.length > 0) {
      builder.andWhere('id NOT IN (:...keepIds)', { keepIds });
    }
    await builder.execute();
  }
}
