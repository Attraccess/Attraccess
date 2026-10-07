import { User } from '@attraccess/database-entities';
import { UnauthorizedException } from '@nestjs/common';
import type { AuthenticationResponseJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server';
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { UserEmailNotVerifiedException } from '../errors/userEmailNotVerified.exception';
import { PasskeyRegistrationImplementation } from './passkey-registration';
import { parseTransports } from './passkey.service.feature-definitions';
export abstract class PasskeyAuthenticationFlowImplementation extends PasskeyRegistrationImplementation {
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

    const passkey = await this.passkeyRepository.findOneBy({ credentialId: response.id });
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

    await this.passkeyRepository.update(passkey.id, {
      counter: verification.authenticationInfo.newCounter,
      backedUp: verification.authenticationInfo.credentialBackedUp,
      lastUsedAt: new Date(),
    });

    const user = await this.userRepository.findOneBy({ id: passkey.userId });
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
}
