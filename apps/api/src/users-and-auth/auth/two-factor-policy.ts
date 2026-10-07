import { User } from '@attraccess/database-entities';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { TwoFactorEnrollmentImplementation } from './two-factor-enrollment';
import { TwoFactorPolicy } from './two-factor.dto';
export abstract class TwoFactorPolicyImplementation extends TwoFactorEnrollmentImplementation {
  async getPolicy(): Promise<TwoFactorPolicy> {
    const setting = await this.settingRepository.findOneBy({
      parent: this.policyParent,
      key: this.policyKey,
    });

    if (setting?.value && Object.values(TwoFactorPolicy).includes(setting.value as TwoFactorPolicy)) {
      return setting.value as TwoFactorPolicy;
    }

    return TwoFactorPolicy.OPTIONAL;
  }

  async setPolicy(policy: TwoFactorPolicy): Promise<void> {
    const existing = await this.settingRepository.findOneBy({
      parent: this.policyParent,
      key: this.policyKey,
    });

    if (existing) {
      await this.settingRepository.update(existing.id, {
        value: policy,
      });
      return;
    }

    await this.settingRepository.insert({
      parent: this.policyParent,
      key: this.policyKey,
      value: policy,
    });
  }

  protected isPolicyRequiredForUser(policy: TwoFactorPolicy, user: User): boolean {
    if (policy === TwoFactorPolicy.REQUIRED_FOR_ALL) {
      return true;
    }

    if (policy === TwoFactorPolicy.REQUIRED_FOR_PRIVILEGED) {
      return this.isPrivilegedUser(user);
    }

    return false;
  }

  protected isPrivilegedUser(user: User): boolean {
    const effectivePerms = (user as AuthenticatedUser).effectivePermissions;
    if (!effectivePerms) {
      this.logger.warn(
        `isPrivilegedUser: effectivePermissions missing for user ${user.id} — treating as not privileged`,
      );
      return false;
    }
    if (effectivePerms.size === 0) return false;
    // privileged = holds any permission outside the basic resources.* namespace
    // (avoids coupling to seed-data assumptions about which permissions the default role carries)
    return [...effectivePerms].some((p) => !p.startsWith('resources.'));
  }
}
