import { Passkey, User } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import type { PublicKeyCredentialCreationOptionsJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { RP_NAME, parseTransports } from './passkey.service.feature-definitions';
import { PasskeyServiceRouteContext } from './passkey.service.route-context';
export abstract class PasskeyRegistrationImplementation extends PasskeyServiceRouteContext {
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

    return this.passkeyRepository.save(
      this.passkeyRepository.create({
        userId: user.id,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        transports: credential.transports?.join(',') ?? null,
        name: name?.trim() || 'Passkey',
        backedUp: credentialBackedUp,
      }),
    );
  }
}
