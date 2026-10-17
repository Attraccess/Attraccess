import type { Passkey, User } from '@attraccess/application-models';

import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { PasskeyPersistence } from '../persistence/port';

import { SettingsService } from '../../../settings/settings.service';
import {
  type AuthenticationResponseJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type PublicKeyCredentialCreationOptionsJSON,
  type RegistrationResponseJSON,
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';

import { UserEmailNotVerifiedException } from '../errors/userEmailNotVerified.exception';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export const RP_NAME = 'Attraccess';

/** Where the ceremony is happening: the configured app URL, plus the browser's own origin when it is the same host. */
export interface RelyingParty {
  rpID: string;
  expectedOrigin: string[];
}

export function readChallengeFromClientData(clientDataJSON: string): string | null {
  try {
    const parsed = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8'));
    return typeof parsed?.challenge === 'string' ? parsed.challenge : null;
  } catch {
    return null;
  }
}

export function parseTransports(value: string | null): AuthenticatorTransportFuture[] | undefined {
  if (!value) {
    return undefined;
  }
  return value.split(',').filter(Boolean) as AuthenticatorTransportFuture[];
}

export function safeOrigin(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function hostnameOf(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

@Injectable()
export class PasskeyService {
  constructor(
    protected readonly persistence: PasskeyPersistence,
    protected readonly settingsService: SettingsService,
  ) {}

  protected readonly logger = new Logger(PasskeyService.name);

  /**
   * The RP ID must be a registrable domain, and every accepted origin must live on it.
   * The request origin is only honoured when its hostname already matches the RP ID, so a
   * different port (API 3001 vs frontend 4201 in dev) works while attacker.com never does.
   */
  async resolveRelyingParty(requestOrigin?: string): Promise<RelyingParty> {
    const appUrl = await this.settingsService.getUrl();
    const appOrigin = safeOrigin(appUrl);
    const rpID = hostnameOf(appOrigin ?? requestOrigin);

    if (!rpID) {
      throw new BadRequestException('PasskeyRelyingPartyNotConfigured');
    }

    const expectedOrigin = [appOrigin, requestOrigin].filter(
      (origin): origin is string => !!origin && hostnameOf(origin) === rpID,
    );

    return { rpID, expectedOrigin: [...new Set(expectedOrigin)] };
  }

  async listForUser(userId: number): Promise<Passkey[]> {
    return this.persistence.listForUser(userId);
  }

  async delete(userId: number, passkeyId: number): Promise<void> {
    const removed = await this.persistence.removeOwned(userId, passkeyId);
    if (!removed) {
      throw new NotFoundException('PasskeyNotFound');
    }
  }

  async rename(userId: number, passkeyId: number, name: string): Promise<Passkey> {
    const passkey = await this.persistence.findOwned(userId, passkeyId);
    if (!passkey) {
      throw new NotFoundException('PasskeyNotFound');
    }
    passkey.name = name;
    return this.persistence.savePasskey(passkey);
  }

  protected async storeChallenge(challenge: string, userId: number | null): Promise<void> {
    // ponytail: opportunistic sweep instead of a cron; challenges live 5 minutes so the table stays tiny
    await this.persistence.removeExpiredChallenges(new Date());
    await this.persistence.storeChallenge(challenge, userId, new Date(Date.now() + CHALLENGE_TTL_MS));
  }

  /**
   * Looks up the challenge the client echoed back and burns it, so a captured assertion
   * can never be replayed.
   */
  protected async consumeChallenge(clientDataJSON: string, userId: number | null): Promise<string> {
    const challenge = readChallengeFromClientData(clientDataJSON);
    if (!challenge) {
      throw new BadRequestException('PasskeyChallengeInvalid');
    }

    const stored = await this.persistence.consumeChallenge(challenge);

    if (!stored || stored.expiresAt.getTime() < Date.now() || stored.userId !== userId) {
      throw new BadRequestException('PasskeyChallengeInvalid');
    }

    return challenge;
  }

  async createAuthenticationOptions(requestOrigin?: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const { rpID } = await this.resolveRelyingParty(requestOrigin);

    // No allowCredentials: the authenticator picks a discoverable credential, so we never
    // have to reveal whether a given username exists.
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' });

    await this.storeChallenge(options.challenge, null);
    return options;
  }

  async verifyAuthentication(response: AuthenticationResponseJSON, requestOrigin?: string): Promise<User> {
    const { rpID, expectedOrigin } = await this.resolveRelyingParty(requestOrigin);
    const expectedChallenge = await this.consumeChallenge(response.response.clientDataJSON, null);

    const passkey = await this.persistence.findCredential(response.id);
    if (!passkey) {
      throw new UnauthorizedException('PasskeyUnknownCredential');
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64url')),
        counter: passkey.counter,
        transports: parseTransports(passkey.transports),
      },
    });

    if (!verification.verified) {
      throw new UnauthorizedException('PasskeyAuthenticationFailed');
    }

    await this.persistence.recordAuthentication(
      passkey.id,
      verification.authenticationInfo.newCounter,
      verification.authenticationInfo.credentialBackedUp,
      new Date(),
    );

    const user = await this.persistence.findUser(passkey.userId);
    if (!user) {
      throw new UnauthorizedException('PasskeyUnknownCredential');
    }

    // Password login refuses an unverified address, and changeEmail clears the flag - so a passkey
    // registered before the change must not be a way around the re-verification gate.
    if (!user.isEmailVerified) {
      throw new UserEmailNotVerifiedException();
    }

    this.logger.log(`User ${user.id} (${user.username}) signed in with passkey ${passkey.id}`);
    return user;
  }

  async createRegistrationOptions(user: User, requestOrigin?: string): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const { rpID } = await this.resolveRelyingParty(requestOrigin);
    const existing = await this.listForUser(user.id);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userName: user.username,
      userDisplayName: user.username,
      // The user handle must be stable so authenticators overwrite rather than pile up credentials
      userID: new TextEncoder().encode(String(user.id)),
      attestationType: 'none',
      excludeCredentials: existing.map((passkey) => ({
        id: passkey.credentialId,
        transports: parseTransports(passkey.transports),
      })),
      authenticatorSelection: {
        // Discoverable credentials are what make usernameless "Sign in with a passkey" possible
        residentKey: 'required',
        userVerification: 'preferred',
      },
    });

    await this.storeChallenge(options.challenge, user.id);
    return options;
  }

  async verifyRegistration(
    user: User,
    response: RegistrationResponseJSON,
    name: string | undefined,
    requestOrigin?: string,
  ): Promise<Passkey> {
    const { rpID, expectedOrigin } = await this.resolveRelyingParty(requestOrigin);
    const expectedChallenge = await this.consumeChallenge(response.response.clientDataJSON, user.id);

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (!verification.verified) {
      throw new BadRequestException('PasskeyRegistrationFailed');
    }

    const { credential, credentialBackedUp } = verification.registrationInfo;

    return this.persistence.registerPasskey({
      userId: user.id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: credential.transports?.join(',') ?? null,
      name: name?.trim() || 'Passkey',
      backedUp: credentialBackedUp,
    });
  }
}
