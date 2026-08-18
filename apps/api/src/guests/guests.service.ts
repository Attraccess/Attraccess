import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, FindOptionsWhere, Repository } from 'typeorm';
import { randomInt } from 'crypto';
import {
  AuthenticationDetail,
  AuthenticationType,
  IntroductionHistoryAction,
  ResourceIntroduction,
  User,
  UserType,
} from '@attraccess/database-entities';
import { EncryptionService } from '../encryption/encryption.service';
import { SettingsService } from '../settings/settings.service';
import { BruteForceProtectionService } from '../users-and-auth/rate-limiting/brute-force.service';
import { UsersService } from '../users-and-auth/users/users.service';
import { MetricsService } from '../metrics/metrics.service';
import { PaginatedResponse } from '../types/response';
import { UserNotFoundException } from '../exceptions/user.notFound.exception';
import { CreateGuestDto } from './dtos/create-guest.dto';
import { UpdateGuestDto } from './dtos/update-guest.dto';
import { GuestDto } from './dtos/guest.dto';
import { GuestEnrollmentDto } from './dtos/guest-enrollment.dto';
import { GuestAccessDto, GuestAccessEntryDto } from './dtos/guest-access.dto';

const GUEST_CODE_MAX_ATTEMPTS = 25;

@Injectable()
export class GuestsService {
  private readonly logger = new Logger(GuestsService.name);
  private otplibPromise: Promise<typeof import('otplib')> | null = null;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AuthenticationDetail)
    private readonly authenticationDetailRepository: Repository<AuthenticationDetail>,
    @InjectRepository(ResourceIntroduction)
    private readonly resourceIntroductionRepository: Repository<ResourceIntroduction>,
    private readonly encryptionService: EncryptionService,
    private readonly settingsService: SettingsService,
    private readonly bruteForce: BruteForceProtectionService,
    private readonly usersService: UsersService,
    private readonly metricsService: MetricsService,
  ) {}

  async create(data: CreateGuestDto): Promise<{ guest: GuestDto; enrollment: GuestEnrollmentDto }> {
    const name = (data.name ?? '').trim();
    if (!name) {
      throw new BadRequestException('Guest name cannot be empty');
    }

    await this.assertNameAvailable(name);

    const email = data.email?.trim() || null;
    if (email) {
      await this.assertEmailAvailable(email);
    }

    const user = new User();
    user.username = name;
    user.email = email;
    user.userType = UserType.GUEST;
    user.guestCode = await this.generateUniqueGuestCode();
    user.guestEnabled = true;
    user.isEmailVerified = false;
    user.externalIdentifier = null;

    const saved = await this.userRepository.save(user);
    this.metricsService.usersTotal.inc();

    const enrollment = await this.provision(saved);
    this.logger.log(`Created guest user ${saved.id} (code ${saved.guestCode})`);
    return { guest: this.toGuestDto(saved, true), enrollment };
  }

  async findMany(options: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<PaginatedResponse<GuestDto>> {
    const { page, limit, search } = options;
    const skip = (page - 1) * limit;

    let whereCondition: FindOptionsWhere<User>[];
    if (search) {
      whereCondition = [
        { userType: UserType.GUEST, username: ILike(`%${search}%`) },
        { userType: UserType.GUEST, email: ILike(`%${search}%`) },
        { userType: UserType.GUEST, guestCode: ILike(`%${search}%`) },
      ];
    } else {
      whereCondition = [{ userType: UserType.GUEST }];
    }

    const [users, total] = await this.userRepository.findAndCount({
      where: whereCondition,
      skip,
      take: limit,
      order: { username: 'ASC' },
    });

    const userIds = users.map((user) => user.id);
    const credentials =
      userIds.length > 0
        ? await this.authenticationDetailRepository.find({
            where: { userId: In(userIds), type: AuthenticationType.GUEST_OTP },
          })
        : [];
    const withCredential = new Set(credentials.map((detail) => detail.userId));

    return {
      data: users.map((user) => this.toGuestDto(user, withCredential.has(user.id))),
      total,
      page,
      limit,
    };
  }

  async findOne(id: number): Promise<GuestDto> {
    const user = await this.findGuestEntityOrThrow(id);
    const credential = await this.getGuestOtpDetail(user.id);
    return this.toGuestDto(user, !!credential?.totpSecret);
  }

  async update(id: number, data: UpdateGuestDto): Promise<GuestDto> {
    const user = await this.findGuestEntityOrThrow(id);

    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) {
        throw new BadRequestException('Guest name cannot be empty');
      }
      if (name !== user.username) {
        await this.assertNameAvailable(name, user.id);
        user.username = name;
      }
    }

    if (data.email !== undefined) {
      const email = data.email?.trim() || null;
      if (email && email !== user.email) {
        await this.assertEmailAvailable(email, user.id);
      }
      user.email = email;
    }

    if (data.guestEnabled !== undefined) {
      user.guestEnabled = data.guestEnabled;
    }

    const saved = await this.userRepository.save(user);
    const credential = await this.getGuestOtpDetail(saved.id);
    return this.toGuestDto(saved, !!credential?.totpSecret);
  }

  async delete(id: number): Promise<void> {
    const user = await this.findGuestEntityOrThrow(id);
    // Delete first: deleteOne can still fail (e.g. active usage sessions) and releasing the
    // code beforehand would leave a live guest unable to authenticate while their code is
    // already reissuable to someone else.
    await this.usersService.deleteOne(user.id);
    // Release the short guest code so it can be reissued to a future guest. The row is
    // soft-deleted at this point but the unique index still covers it until purged.
    await this.userRepository.update(user.id, { guestCode: null });
    this.logger.log(`Deleted guest user ${id}`);
  }

  /**
   * List the resource and group introductions that grant the guest access. Guests only ever get
   * access through introductions — never through roles or introducer/maintainer permissions.
   */
  async getAccess(id: number): Promise<GuestAccessDto> {
    const user = await this.findGuestEntityOrThrow(id);

    const introductions = await this.resourceIntroductionRepository.find({
      where: { receiverUserId: user.id },
      relations: ['resource', 'resourceGroup', 'history'],
    });

    const entries: GuestAccessEntryDto[] = introductions.map((introduction) => {
      const lastHistory = (introduction.history ?? [])
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      const valid = lastHistory?.action === IntroductionHistoryAction.GRANT;

      const isGroup = introduction.resourceGroupId != null;
      const entry = new GuestAccessEntryDto();
      entry.introductionId = introduction.id;
      entry.type = isGroup ? 'group' : 'resource';
      entry.targetId = isGroup ? (introduction.resourceGroupId as number) : (introduction.resourceId as number);
      entry.targetName = isGroup
        ? (introduction.resourceGroup?.name ?? `Group ${entry.targetId}`)
        : (introduction.resource?.name ?? `Resource ${entry.targetId}`);
      entry.valid = valid;
      return entry;
    });

    entries.sort((a, b) => a.type.localeCompare(b.type) || a.targetName.localeCompare(b.targetName));
    return { entries };
  }

  /**
   * Reveal the current enrollment (QR / otpauth URI / secret) for a guest without rotating it.
   */
  async getEnrollment(id: number): Promise<GuestEnrollmentDto> {
    const user = await this.findGuestEntityOrThrow(id);
    const detail = await this.getGuestOtpDetail(user.id);
    if (!detail?.totpSecret) {
      throw new NotFoundException('Guest has no active TOTP credential');
    }

    const secret = this.resolveSecret(detail);
    const otpauthUrl = await this.buildOtpauthUrl(user, secret);
    return { guestCode: user.guestCode as string, secret, otpauthUrl };
  }

  /**
   * Rotate the guest's TOTP secret. The previous credential is invalidated immediately.
   */
  async rotate(id: number): Promise<GuestEnrollmentDto> {
    const user = await this.findGuestEntityOrThrow(id);
    const enrollment = await this.provision(user);
    this.logger.log(`Rotated TOTP credential for guest ${user.id}`);
    return enrollment;
  }

  /**
   * Revoke the guest's TOTP credential. The guest can no longer authenticate until re-provisioned.
   */
  async revokeCredential(id: number): Promise<GuestDto> {
    const user = await this.findGuestEntityOrThrow(id);
    const detail = await this.getGuestOtpDetail(user.id);
    if (detail) {
      await this.authenticationDetailRepository.delete(detail.id);
    }
    this.logger.log(`Revoked TOTP credential for guest ${user.id}`);
    return this.toGuestDto(user, false);
  }

  /**
   * Verify a guest's TOTP code. Used by the terminal authentication flow (see ATT-891).
   * Applies rate limiting and replay protection (the matched time step is persisted so a code
   * can only be used once).
   */
  async verifyGuestOtp(guestCode: string, code: string, ip?: string): Promise<User> {
    const normalizedCode = (code ?? '').replace(/\s+/g, '');
    const resolvedIp = ip ?? 'unknown';

    await this.bruteForce.assertIpAllowed('guest_otp', resolvedIp, guestCode);

    const guest = await this.userRepository.findOne({
      where: { guestCode, userType: UserType.GUEST },
    });
    if (!guest) {
      await this.bruteForce.recordFailure('guest_otp', resolvedIp, null, guestCode);
      throw new UnauthorizedException('GuestOtpInvalid');
    }

    await this.bruteForce.assertAccountAllowed(guest);

    if (!guest.guestEnabled) {
      throw new UnauthorizedException('GuestAccountDisabled');
    }

    const detail = await this.getGuestOtpDetail(guest.id);
    if (!detail?.totpSecret) {
      throw new UnauthorizedException('GuestOtpInvalid');
    }

    const secret = this.resolveSecret(detail);
    const { verify } = await this.loadOtplib();
    const result = await verify({
      secret,
      token: normalizedCode,
      strategy: 'totp',
      epochTolerance: 30,
      afterTimeStep: detail.totpLastTimeStep ?? undefined,
    });

    // otplib may return a plain boolean or a result object depending on the version/wrapper
    // (two-factor.service.ts handles it the same way).
    const isValid = typeof result === 'boolean' ? result : result.valid;
    if (!isValid) {
      await this.bruteForce.recordFailure('guest_otp', resolvedIp, guest.id, guestCode);
      throw new UnauthorizedException('GuestOtpInvalid');
    }

    // Replay protection: atomically consume the matched time step. The conditional update
    // guarantees only one concurrent verification of the same code succeeds — a second
    // request carrying the same (or an older) time step finds totpLastTimeStep already
    // advanced and gets affected = 0.
    const matchedStep =
      typeof result === 'boolean' || !('timeStep' in result)
        ? Math.floor(Date.now() / 1000 / 30)
        : result.timeStep;
    const consumed = await this.authenticationDetailRepository
      .createQueryBuilder()
      .update(AuthenticationDetail)
      .set({ totpLastTimeStep: matchedStep })
      .where('id = :id', { id: detail.id })
      .andWhere('(totpLastTimeStep IS NULL OR totpLastTimeStep < :matchedStep)', { matchedStep })
      .execute();
    if (!consumed.affected) {
      await this.bruteForce.recordFailure('guest_otp', resolvedIp, guest.id, guestCode);
      throw new UnauthorizedException('GuestOtpInvalid');
    }

    await this.bruteForce.recordSuccess('guest_otp', resolvedIp, guest.id, guestCode);
    return guest;
  }

  private async provision(user: User): Promise<GuestEnrollmentDto> {
    const secret = await this.generateSecret();
    const encryptedSecret = this.encryptionService.encrypt(secret);
    const otpauthUrl = await this.buildOtpauthUrl(user, secret);

    const existing = await this.getGuestOtpDetail(user.id);
    if (existing) {
      existing.totpSecret = encryptedSecret;
      existing.totpEnabledAt = new Date();
      existing.totpLastTimeStep = null;
      await this.authenticationDetailRepository.save(existing);
    } else {
      const detail = new AuthenticationDetail();
      detail.userId = user.id;
      detail.type = AuthenticationType.GUEST_OTP;
      detail.totpSecret = encryptedSecret;
      detail.totpEnabledAt = new Date();
      detail.totpLastTimeStep = null;
      await this.authenticationDetailRepository.save(detail);
    }

    return { guestCode: user.guestCode as string, secret, otpauthUrl };
  }

  private async findGuestEntityOrThrow(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new UserNotFoundException(id);
    }
    if (user.userType !== UserType.GUEST) {
      throw new NotFoundException('Guest not found');
    }
    return user;
  }

  private async getGuestOtpDetail(userId: number): Promise<AuthenticationDetail | null> {
    return this.authenticationDetailRepository.findOne({
      where: { userId, type: AuthenticationType.GUEST_OTP },
    });
  }

  private resolveSecret(detail: AuthenticationDetail): string {
    if (!detail.totpSecret) {
      throw new NotFoundException('Guest has no active TOTP credential');
    }
    return this.encryptionService.decryptIfEncrypted(detail.totpSecret) ?? detail.totpSecret;
  }

  private async generateUniqueGuestCode(): Promise<string> {
    for (let attempt = 0; attempt < GUEST_CODE_MAX_ATTEMPTS; attempt++) {
      const code = randomInt(0, 10000).toString().padStart(4, '0');
      // Include soft-deleted rows: the unique index still covers them until they are purged.
      const existing = await this.userRepository.findOne({
        where: { guestCode: code },
        withDeleted: true,
      });
      if (!existing) {
        return code;
      }
    }
    throw new InternalServerErrorException('Could not allocate a unique guest code');
  }

  private async assertNameAvailable(name: string, excludeUserId?: number): Promise<void> {
    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.username) = :name', { name: name.toLowerCase() });
    if (excludeUserId !== undefined) {
      queryBuilder.andWhere('user.id != :id', { id: excludeUserId });
    }
    const existing = await queryBuilder.getOne();
    if (existing) {
      throw new BadRequestException('A user with this name already exists');
    }
  }

  private async assertEmailAvailable(email: string, excludeUserId?: number): Promise<void> {
    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .where('user.email = :email', { email });
    if (excludeUserId !== undefined) {
      queryBuilder.andWhere('user.id != :id', { id: excludeUserId });
    }
    const existing = await queryBuilder.getOne();
    if (existing) {
      throw new BadRequestException('A user with this email already exists');
    }
  }

  private async buildOtpauthUrl(user: User, secret: string): Promise<string> {
    const { generateURI } = await this.loadOtplib();
    const issuer = await this.resolveIssuer();
    return generateURI({
      secret,
      label: user.username,
      issuer,
      strategy: 'totp',
    });
  }

  private async generateSecret(): Promise<string> {
    const { generateSecret } = await this.loadOtplib();
    return generateSecret();
  }

  private async resolveIssuer(): Promise<string> {
    const appUrl = await this.settingsService.getUrl();
    if (!appUrl) {
      return 'Attraccess';
    }
    try {
      const url = new URL(appUrl);
      return `Attraccess (${url.hostname})`;
    } catch (error) {
      this.logger.warn('Failed to parse backend URL for guest OTP issuer', error as Error);
      return 'Attraccess';
    }
  }

  private async loadOtplib(): Promise<typeof import('otplib')> {
    if (!this.otplibPromise) {
      this.otplibPromise = import('otplib');
    }
    return this.otplibPromise;
  }

  private toGuestDto(user: User, hasCredential: boolean): GuestDto {
    const dto = new GuestDto();
    dto.id = user.id;
    dto.name = user.username;
    dto.email = user.email ?? null;
    dto.userType = user.userType;
    dto.guestCode = user.guestCode ?? null;
    dto.guestEnabled = user.guestEnabled;
    dto.hasCredential = hasCredential;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    return dto;
  }
}
