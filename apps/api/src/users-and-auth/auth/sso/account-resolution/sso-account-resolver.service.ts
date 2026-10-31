import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuthenticationType, SSOProviderType, User } from '@attraccess/database-entities';
import { UsersService } from '../../../users/users.service';
import { AuthService } from '../../auth.service';
import { AccountLinkingRequiredException } from '../oidc/exceptions/account-linking-required.exception';

/** Error message of the rejection raised when an IdP-unverified email collides with an existing account. */
export const SSO_EMAIL_NOT_VERIFIED = 'SSO_EMAIL_NOT_VERIFIED';

export interface SsoAccountResolutionInput {
  providerType: SSOProviderType;
  providerId: number;
  /** Stable IdP identifier: OIDC `sub` or SAML NameID. */
  subject: string;
  email: string;
  /** `undefined` = the IdP did not say. `false` = the IdP explicitly marked the email as unverified. */
  emailVerified: boolean | undefined;
  /** Raw username candidate; passed through `UsersService.buildUsernameFromSSOClaim`. */
  usernameClaim?: string;
}

/** Everything a provisioning hook may base its decision on when no account matches the identity. */
export interface SsoProvisioningContext extends SsoAccountResolutionInput {
  /** Whether the email may be trusted (`emailVerified !== false`). */
  emailTrusted: boolean;
}

/**
 * Decides what happens when an identity matches no account (no binding, no email match).
 *
 * Resolving to `'create'` provisions the user (the default behaviour). Resolving to `'reject'` fails the
 * login with an `UnauthorizedException`. Throwing propagates unchanged. ATT-836 plugs its on/confirm/off
 * policy and email-domain allowlist in here, so the strategies never need to change. The hook runs only
 * after the binding lookup and the email match, so it can never cause linking or takeover.
 */
export type SsoProvisioningHook = (context: SsoProvisioningContext) => Promise<'create' | 'reject'>;

export const defaultSsoProvisioningHook: SsoProvisioningHook = async () => 'create';

/**
 * The single find-or-link implementation for OIDC and SAML logins.
 *
 * 1. A binding on (providerType, providerId, subject) returns the bound user.
 * 2. An email match without such a binding ALWAYS throws `AccountLinkingRequiredException`
 *    (never a silent link), unless the IdP marked the email as unverified.
 * 3. No match: the provisioning hook decides; the default creates the user and binds it in one transaction.
 */
@Injectable()
export class SsoAccountResolver {
  private readonly logger = new Logger(SsoAccountResolver.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly dataSource: DataSource,
  ) {}

  async resolveSsoUser(
    input: SsoAccountResolutionInput,
    options: { provisioning?: SsoProvisioningHook } = {},
  ): Promise<{ user: User; created: boolean }> {
    const { providerType, providerId, subject, email } = input;

    const boundUserId = await this.authService.findUserIdBySSO(providerType, providerId, subject);
    const boundUser = boundUserId ? await this.usersService.findOne({ id: boundUserId }) : null;
    if (boundUser) return { user: boundUser, created: false };

    const emailTrusted = input.emailVerified !== false;
    const emailOwner = await this.usersService.findOne({ email }).catch(() => null);
    if (emailOwner) {
      if (!emailTrusted) {
        this.logger.warn(`Rejecting ${providerType} login: unverified email belongs to existing user ${emailOwner.id}`);
        throw new UnauthorizedException(SSO_EMAIL_NOT_VERIFIED);
      }
      throw new AccountLinkingRequiredException({ email, externalId: subject, providerId, providerType });
    }

    const decision = await (options.provisioning ?? defaultSsoProvisioningHook)({ ...input, emailTrusted });
    if (decision === 'reject') throw new UnauthorizedException();

    const user = await this.dataSource.transaction((manager) => this.createBoundUser(input, manager));
    this.logger.log(`Created user ${user.id} for ${providerType} provider ${providerId}`);
    return { user, created: true };
  }

  private async createBoundUser(input: SsoAccountResolutionInput, manager: EntityManager): Promise<User> {
    const { providerType, providerId, subject, email } = input;
    const username = this.usersService.buildUsernameFromSSOClaim(input.usernameClaim || email, email);
    const user = await this.usersService.createOne(
      { username, email, externalIdentifier: null, isEmailVerified: input.emailVerified !== false },
      manager,
    );
    if (!user) throw new UnauthorizedException();
    await this.authService.addAuthenticationDetails(
      user.id,
      { type: AuthenticationType.SSO, details: { providerId, providerType, subject } },
      manager,
    );
    return user;
  }
}
