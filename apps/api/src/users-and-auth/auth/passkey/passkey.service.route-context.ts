import { Passkey, User } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { RelyingParty } from './passkey.service.feature-definitions';

export abstract class PasskeyServiceRouteContext {
  public abstract resolveRelyingParty(requestOrigin?: string): Promise<RelyingParty>;
  public abstract listForUser(userId: number): Promise<Passkey[]>;
  protected abstract storeChallenge(challenge: string, userId: number | null): Promise<void>;
  protected abstract consumeChallenge(clientDataJSON: string, userId: number | null): Promise<string>;
  protected abstract readonly passkeyRepository: Repository<Passkey>;
  protected abstract readonly userRepository: Repository<User>;
  protected abstract readonly logger: Logger;
}
