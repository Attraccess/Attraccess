import { Passkey, PasskeyChallenge, User } from '@attraccess/database-entities';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { SettingsService } from '../../../settings/settings.service';
import { PasskeyAuthenticationFlowImplementation } from './passkey-authentication-flow';
import {
  CHALLENGE_TTL_MS,
  RelyingParty,
  hostnameOf,
  readChallengeFromClientData,
  safeOrigin,
} from './passkey.service.feature-definitions';

@Injectable()
export class PasskeyService extends PasskeyAuthenticationFlowImplementation {
  protected readonly logger = new Logger(PasskeyService.name);

  constructor(
    @InjectRepository(Passkey)
    protected readonly passkeyRepository: Repository<Passkey>,
    @InjectRepository(PasskeyChallenge)
    protected readonly challengeRepository: Repository<PasskeyChallenge>,
    @InjectRepository(User)
    protected readonly userRepository: Repository<User>,
    protected readonly settingsService: SettingsService,
  ) {
    super();
  }

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
    return this.passkeyRepository.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async delete(userId: number, passkeyId: number): Promise<void> {
    const result = await this.passkeyRepository.delete({ id: passkeyId, userId });
    if (!result.affected) {
      throw new NotFoundException('PasskeyNotFound');
    }
  }

  async rename(userId: number, passkeyId: number, name: string): Promise<Passkey> {
    const passkey = await this.passkeyRepository.findOneBy({ id: passkeyId, userId });
    if (!passkey) {
      throw new NotFoundException('PasskeyNotFound');
    }
    passkey.name = name;
    return this.passkeyRepository.save(passkey);
  }

  protected async storeChallenge(challenge: string, userId: number | null): Promise<void> {
    // ponytail: opportunistic sweep instead of a cron; challenges live 5 minutes so the table stays tiny
    await this.challengeRepository.delete({ expiresAt: LessThan(new Date()) });
    await this.challengeRepository.insert({
      challenge,
      userId,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    });
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

    const stored = await this.challengeRepository.findOneBy({ challenge });
    await this.challengeRepository.delete({ challenge });

    if (!stored || stored.expiresAt.getTime() < Date.now() || stored.userId !== userId) {
      throw new BadRequestException('PasskeyChallengeInvalid');
    }

    return challenge;
  }
}

export { RelyingParty } from './passkey.service.feature-definitions';
