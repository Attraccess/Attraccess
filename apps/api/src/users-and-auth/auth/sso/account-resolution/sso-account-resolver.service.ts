import { Inject, Injectable, Logger, Optional, UnauthorizedException } from '@nestjs/common';
import { AuthenticationType, SSOProviderType, type UserAccount } from '@attraccess/application-models';
import type { TransactionContext } from '../../../../database/transaction-context';
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
  /** Names the IdP released; an absent or blank claim is undefined and never clears a stored name. */
  firstName?: string;
  lastName?: string;
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
 * login with a plain `UnauthorizedException`; to fail with a specific error code, throw that exception
 * from the hook instead (it propagates unchanged). The hook runs only after the binding lookup and the
 * email match, and before any transaction is opened, so it can never cause linking or takeover.
 *
 * ATT-836 plugs its on/confirm/off policy and email-domain allowlist in by providing
 * {@link SSO_PROVISIONING_HOOK}; neither the strategies nor this resolver need to change for that.
 */
export type SsoProvisioningHook = (context: SsoProvisioningContext) => Promise<'create' | 'reject'>;

/** DI token for the {@link SsoProvisioningHook}. Unset = {@link defaultSsoProvisioningHook}. */
export const SSO_PROVISIONING_HOOK = Symbol('SSO_PROVISIONING_HOOK');

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
    // optional: extension point; without a hook, defaultSsoProvisioningHook keeps the standard create-on-first-login rule
    @Optional()
    @Inject(SSO_PROVISIONING_HOOK)
    private readonly provisioningHook: SsoProvisioningHook = defaultSsoProvisioningHook,
  ) {}

  async resolveSsoUser(rawInput: SsoAccountResolutionInput) {
    const input = { ...rawInput, email: rawInput.email.trim() };
    const { providerType, providerId, subject, email } = input;

    const boundUserId = await this.authService.findUserIdBySSO(providerType, providerId, subject);
    const boundUser = boundUserId ? await this.usersService.findOne({ id: boundUserId }) : null;
    if (boundUser) return { user: await this.syncNames(boundUser, input), created: false };

    const emailTrusted = input.emailVerified !== false;
    const emailOwner = await this.usersService.findOne({ email });
    if (emailOwner) {
      if (!emailTrusted) {
        this.logger.warn(`Rejecting ${providerType} login: unverified email belongs to existing user ${emailOwner.id}`);
        throw new UnauthorizedException(SSO_EMAIL_NOT_VERIFIED);
      }
      throw new AccountLinkingRequiredException({ email, externalId: subject, providerId, providerType });
    }

    const decision = await (this.provisioningHook ?? defaultSsoProvisioningHook)({ ...input, emailTrusted });
    if (decision === 'reject') throw new UnauthorizedException();

    const user = await this.usersService.withTransaction((transaction) => this.createBoundUser(input, transaction));
    // createOne skips metrics when it runs inside a caller-owned transaction; record them once it has committed.
    this.usersService.recordCreatedUser(user);
    this.logger.log(`Created user ${user.id} for ${providerType} provider ${providerId}`);
    return { user, created: true };
  }

  /** Applies the names the IdP released at this login. Writes only when one changed; a missing claim changes nothing. */
  private async syncNames(
    user: UserAccount,
    claims: Pick<SsoAccountResolutionInput, 'firstName' | 'lastName'>,
  ): Promise<UserAccount> {
    const changes: { firstName?: string; lastName?: string } = {};
    if (claims.firstName && claims.firstName !== user.firstName) changes.firstName = claims.firstName;
    if (claims.lastName && claims.lastName !== user.lastName) changes.lastName = claims.lastName;
    if (Object.keys(changes).length === 0) return user;
    return this.usersService.updateOne(user.id, changes);
  }

  private async createBoundUser(input: SsoAccountResolutionInput, transaction: TransactionContext) {
    const { providerType, providerId, subject, email } = input;
    const username = this.usersService.buildUsernameFromSSOClaim(input.usernameClaim || email, email);
    const user = await this.usersService.createOne(
      {
        username,
        firstName: input.firstName,
        lastName: input.lastName,
        email,
        externalIdentifier: null,
        isEmailVerified: input.emailVerified !== false,
      },
      transaction,
    );
    if (!user) throw new UnauthorizedException();
    await this.authService.addAuthenticationDetails(
      user.id,
      { type: AuthenticationType.SSO, details: { providerId, providerType, subject } },
      transaction,
    );
    return user;
  }
}
