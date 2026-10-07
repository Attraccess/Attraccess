import { AuthenticationType, SSOProviderType, User } from '@attraccess/database-entities';
import { EntityManager, FindOptionsWhere, In, FindOneOptions as TypeormFindOneOptions } from 'typeorm';
import { UserAccountCreationImplementation } from './user-account-creation';
import { FindOneOptions, FindOneOptionsSchema } from './users.service.feature-definitions';
export abstract class UserLookupsImplementation extends UserAccountCreationImplementation {
  async findOne(options: FindOneOptions, relations?: string[], manager?: EntityManager): Promise<User | null> {
    const validatedOptions = FindOneOptionsSchema.parse(options);

    // Build a where condition that uses case-insensitive comparison for username
    const whereCondition: TypeormFindOneOptions<User>['where'] = {};

    if (validatedOptions.id !== undefined) {
      whereCondition.id = validatedOptions.id;
    }

    if (validatedOptions.username !== undefined) {
      whereCondition.username = this.cleanupUsername(validatedOptions.username);
    }

    if (validatedOptions.email !== undefined) {
      whereCondition.email = validatedOptions.email;
    }

    if (validatedOptions.externalIdentifier !== undefined) {
      whereCondition.externalIdentifier = validatedOptions.externalIdentifier;
    }

    const userRepo = manager ? manager.getRepository(User) : this.userRepository;
    const user = await userRepo.findOne({
      where: whereCondition,
      relations,
    });

    return user || null;
  }

  public async isSSOUser(userId: number): Promise<boolean> {
    const ssoUser = await this.userRepository
      .createQueryBuilder('user')
      .where('user.id = :id', { id: userId })
      .leftJoin('user.authenticationDetails', 'authenticationDetails')
      .andWhere('authenticationDetails.type = :type', { type: AuthenticationType.SSO })
      .getOne();

    return !!ssoUser;
  }

  public async findOneBySSO(providerType: SSOProviderType, providerId: number, subject: string): Promise<User | null> {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.authenticationDetails', 'authenticationDetails')
      .where('authenticationDetails.type = :type', { type: AuthenticationType.SSO })
      .andWhere('authenticationDetails.providerType = :providerType', { providerType })
      .andWhere('authenticationDetails.providerId = :providerId', { providerId })
      .andWhere('authenticationDetails.ssoSubject = :subject', { subject })
      .getOne();

    return user ?? null;
  }

  async countUsers(): Promise<number> {
    return this.userRepository.count();
  }

  async findByEmailsOrUsernames(emails: string[], usernames: string[]): Promise<User[]> {
    const normalizedEmails = Array.from(new Set(emails.map((email) => email.trim()).filter((email) => email !== '')));
    const normalizedUsernames = Array.from(
      new Set(usernames.map((username) => this.cleanupUsername(username)).filter((username) => username !== '')),
    );

    const where: FindOptionsWhere<User>[] = [];

    if (normalizedEmails.length) {
      where.push({ email: In(normalizedEmails) });
    }

    if (normalizedUsernames.length) {
      where.push({ username: In(normalizedUsernames) });
    }

    if (!where.length) {
      return [];
    }

    return this.userRepository.find({ where });
  }
}
