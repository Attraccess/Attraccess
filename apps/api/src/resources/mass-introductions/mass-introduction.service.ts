import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, randomUUID } from 'crypto';
import { Resource, ResourceGroup } from '@attraccess/database-entities';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { ResourceIntroductionsService } from '../introductions/resouceIntroductions.service';
import { ResourceIntroducersService } from '../introducers/resourceIntroducers.service';
import { ResourceGroupsIntroductionsService } from '../groups/introductions/resourceGroups.introductions.service';
import { ResourceGroupsIntroducersService } from '../groups/introducers/resourceGroups.introducers.service';
import { MassIntroductionLiveService } from './mass-introduction-live.service';
import {
  ActiveMassIntroduction,
  MassIntroductionParticipant,
  MassIntroductionReaderPort,
  MassIntroductionTarget,
} from './mass-introduction.types';
import {
  MassIntroductionMethod,
  MassIntroductionReaderState,
  MassIntroductionSessionDto,
  MassIntroductionTargetType,
} from './dtos/massIntroductionSession.dto';
import { MassIntroductionEndReason, MassIntroductionLiveEventType } from './dtos/massIntroductionLiveEvent.dto';
import { StartMassIntroductionDto } from './dtos/startMassIntroduction.dto';
import { RedeemMassIntroductionResponseDto } from './dtos/redeemMassIntroduction.dto';
import { MassIntroductionTicketDto } from './dtos/claimMassIntroduction.dto';
import {
  currentMassIntroductionCode,
  isValidMassIntroductionCode,
  newMassIntroductionCodeSecret,
} from './mass-introduction-codes';

/**
 * Short-lived sessions in which an introducer introduces everyone who scans a QR code, or taps a
 * card at a chosen reader, to one resource or resource group (ATT-1151).
 *
 * Sessions live in memory like supervision requests: they last 15 minutes and are worthless after
 * an API restart, so persisting them would only add cleanup work.
 */
@Injectable()
export class MassIntroductionService {
  public static readonly TTL_MS = 15 * 60_000;

  /** Long enough to sign in (including SSO) after scanning. */
  public static readonly TICKET_TTL_MS = 10 * 60_000;

  public static readonly MAX_FAILED_CLAIMS_PER_MINUTE = 20;

  protected readonly logger = new Logger(MassIntroductionService.name);

  protected readonly sessions = new Map<string, ActiveMassIntroduction>();

  protected readonly sessionIdsByPublicId = new Map<string, string>();

  protected readerPort: MassIntroductionReaderPort | null = null;

  constructor(
    protected readonly resourceIntroductions: ResourceIntroductionsService,
    protected readonly resourceIntroducers: ResourceIntroducersService,
    protected readonly groupIntroductions: ResourceGroupsIntroductionsService,
    protected readonly groupIntroducers: ResourceGroupsIntroducersService,
    protected readonly live: MassIntroductionLiveService,
    @InjectRepository(Resource) protected readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ResourceGroup) protected readonly resourceGroupRepository: Repository<ResourceGroup>,
  ) {}

  /** Registered by the Attractap module at startup; see {@link MassIntroductionReaderPort}. */
  public setReaderPort(port: MassIntroductionReaderPort): void {
    this.readerPort = port;
  }

  public async start(user: AuthenticatedUser, dto: StartMassIntroductionDto): Promise<MassIntroductionSessionDto> {
    if ((dto.resourceId == null) === (dto.resourceGroupId == null)) {
      throw new BadRequestException('Provide exactly one of resourceId and resourceGroupId');
    }

    const target = await this.loadTarget(dto);
    const viaPermission = user.effectivePermissions?.has('resources.access.manage') === true;
    if (!viaPermission && !(await this.isIntroducer(target, user.id))) {
      throw new ForbiddenException('You are not an introducer for this target');
    }

    // One session per introducer and target: reopening the dialog replaces the old QR code.
    for (const existing of this.sessions.values()) {
      if (
        existing.introducer.id === user.id &&
        existing.target.type === target.type &&
        existing.target.id === target.id
      ) {
        this.end(existing, MassIntroductionEndReason.CANCELLED);
      }
    }

    const now = new Date();
    const session: ActiveMassIntroduction = {
      id: randomUUID(),
      publicId: randomBytes(12).toString('base64url'),
      codeSecret: newMassIntroductionCodeSecret(),
      tickets: new Map(),
      failedClaims: { windowStart: now.getTime(), count: 0 },
      target,
      introducer: {
        id: user.id,
        username: user.username,
        authenticationMethod: user.authenticationMethod ?? null,
        apiTokenId: user.apiTokenId ?? null,
        viaPermission,
      },
      reader: null,
      participants: new Map(),
      joining: new Map(),
      createdAt: now,
      expiresAt: new Date(now.getTime() + MassIntroductionService.TTL_MS),
      // Unreferenced: an open QR code must not keep the process alive on shutdown.
      timeout: setTimeout(() => this.expire(session.id), MassIntroductionService.TTL_MS).unref(),
    };
    this.sessions.set(session.id, session);
    this.sessionIdsByPublicId.set(session.publicId, session.id);

    if (dto.readerId != null) {
      if (!this.readerPort) {
        this.end(session, MassIntroductionEndReason.CANCELLED, { silent: true });
        throw new ServiceUnavailableException('Reader integration is not available');
      }
      let readerName: string;
      try {
        ({ readerName } = await this.readerPort.arm({
          readerId: dto.readerId,
          sessionId: session.id,
          targetName: target.name,
          introducerUsername: user.username,
          expiresAt: session.expiresAt,
        }));
      } catch (error) {
        this.end(session, MassIntroductionEndReason.CANCELLED, { silent: true });
        throw error;
      }
      // A concurrent start may have replaced this session while the reader was being armed; its
      // end() could not disarm a reader it did not know about yet.
      if (this.sessions.get(session.id) !== session) {
        this.readerPort.disarm({
          readerId: dto.readerId,
          sessionId: session.id,
          reason: MassIntroductionEndReason.CANCELLED,
        });
        throw new GoneException('The mass introduction was replaced while starting');
      }
      session.reader = { id: dto.readerId, name: readerName, state: MassIntroductionReaderState.ACTIVE };
    }

    this.logger.log(
      `User ${user.id} started mass introduction ${session.id} for ${target.type} ${target.id}` +
        (session.reader ? ` with reader ${session.reader.id}` : ''),
    );
    return this.toDto(session);
  }

  public get(sessionId: string, userId: number): MassIntroductionSessionDto {
    return this.toDto(this.getOwned(sessionId, userId));
  }

  public cancel(sessionId: string, userId: number): void {
    this.end(this.getOwned(sessionId, userId), MassIntroductionEndReason.CANCELLED);
  }

  /**
   * A participant scanned the QR code: exchange its short-lived code for a single-use ticket. Needs
   * no sign-in, because the code would expire while a signed-out participant logs in.
   */
  public claim(token: string, nowMs = Date.now()): MassIntroductionTicketDto {
    const [publicId, code] = token.split('.');
    const session = this.sessions.get(this.sessionIdsByPublicId.get(publicId ?? '') ?? '');
    if (!session || !code) {
      throw new NotFoundException('This mass introduction QR code is invalid or has expired');
    }

    const attempts = session.failedClaims;
    if (nowMs - attempts.windowStart >= 60_000) {
      attempts.windowStart = nowMs;
      attempts.count = 0;
    }
    if (attempts.count >= MassIntroductionService.MAX_FAILED_CLAIMS_PER_MINUTE) {
      throw new HttpException('Too many invalid codes, try again in a minute', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!isValidMassIntroductionCode(session.codeSecret, code, nowMs)) {
      attempts.count += 1;
      throw new NotFoundException('This mass introduction QR code is invalid or has expired');
    }

    for (const [ticket, { expiresAt }] of session.tickets) {
      if (expiresAt <= nowMs) session.tickets.delete(ticket);
    }
    const ticket = randomBytes(24).toString('base64url');
    const expiresAt = nowMs + MassIntroductionService.TICKET_TTL_MS;
    session.tickets.set(ticket, { expiresAt });
    return { ticket: `${session.publicId}.${ticket}`, expiresAt: new Date(expiresAt) };
  }

  /** The signed-in participant redeems the ticket from their scan. */
  public async redeemTicket(
    ticket: string,
    user: { id: number; username: string },
    nowMs = Date.now(),
  ): Promise<RedeemMassIntroductionResponseDto> {
    const [publicId, secret] = ticket.split('.');
    const session = this.sessions.get(this.sessionIdsByPublicId.get(publicId ?? '') ?? '');
    const entry = secret ? session?.tickets.get(secret) : undefined;
    if (!session || !entry || entry.expiresAt <= nowMs) {
      throw new NotFoundException('This mass introduction QR code is invalid or has expired');
    }
    const participant = await this.join(session, user, MassIntroductionMethod.QR);
    session.tickets.delete(secret);
    return {
      target: { ...session.target },
      alreadyIntroduced: participant.alreadyIntroduced,
    };
  }

  /** A participant tapped an authenticated card at the session's reader. */
  public async redeemCard(
    sessionId: string,
    readerId: number,
    user: { id: number; username: string },
  ): Promise<{ participant: MassIntroductionParticipant; participantCount: number }> {
    const session = this.sessions.get(sessionId);
    if (!session || session.reader?.id !== readerId || session.reader.state !== MassIntroductionReaderState.ACTIVE) {
      throw new NotFoundException('NO_MASS_INTRODUCTION_IN_PROGRESS');
    }
    const participant = await this.join(session, user, MassIntroductionMethod.NFC);
    return { participant, participantCount: session.participants.size };
  }

  /** The reader left the session (cancel button, disconnect); the QR code keeps working. */
  public detachReader(sessionId: string, readerId: number): void {
    const session = this.sessions.get(sessionId);
    if (!session?.reader || session.reader.id !== readerId) {
      return;
    }
    if (session.reader.state === MassIntroductionReaderState.DETACHED) {
      return;
    }
    session.reader.state = MassIntroductionReaderState.DETACHED;
    this.emitUpdated(session);
  }

  protected async join(
    session: ActiveMassIntroduction,
    user: { id: number; username: string },
    method: MassIntroductionMethod,
  ): Promise<MassIntroductionParticipant> {
    if (session.expiresAt.getTime() <= Date.now()) {
      this.expire(session.id);
      throw new NotFoundException('This mass introduction has expired');
    }

    const existing = session.participants.get(user.id);
    if (existing) {
      return existing;
    }
    const inFlight = session.joining.get(user.id);
    if (inFlight) {
      return inFlight;
    }

    const joining = this.grant(session, user, method);
    session.joining.set(user.id, joining);
    try {
      const participant = await joining;
      // A session that ended while granting keeps the grant but has no one left to notify.
      if (this.sessions.get(session.id) === session) {
        session.participants.set(user.id, participant);
        this.emitUpdated(session);
      }
      return participant;
    } finally {
      session.joining.delete(user.id);
    }
  }

  protected async grant(
    session: ActiveMassIntroduction,
    user: { id: number; username: string },
    method: MassIntroductionMethod,
  ): Promise<MassIntroductionParticipant> {
    const { target, introducer } = session;

    if (!introducer.viaPermission && !(await this.isIntroducer(target, introducer.id))) {
      this.end(session, MassIntroductionEndReason.REVOKED);
      throw new ForbiddenException('The introducer can no longer introduce to this target');
    }

    const alreadyIntroduced =
      target.type === MassIntroductionTargetType.RESOURCE
        ? await this.resourceIntroductions.hasValidIntroduction(target.id, user.id)
        : await this.groupIntroductions.hasValidIntroduction({ groupId: target.id, userId: user.id });

    if (!alreadyIntroduced) {
      const options = {
        tutorUserId: introducer.id,
        performedByUserId: introducer.id,
        authenticationMethod: introducer.authenticationMethod,
        apiTokenId: introducer.apiTokenId,
      };
      if (target.type === MassIntroductionTargetType.RESOURCE) {
        await this.resourceIntroductions.grant(target.id, user.id, undefined, options);
      } else {
        await this.groupIntroductions.grant(target.id, user.id, undefined, options);
      }
    }

    return { userId: user.id, username: user.username, method, alreadyIntroduced, joinedAt: new Date() };
  }

  protected async loadTarget(dto: StartMassIntroductionDto): Promise<MassIntroductionTarget> {
    if (dto.resourceId != null) {
      const resource = await this.resourceRepository.findOne({ where: { id: dto.resourceId } });
      if (!resource) {
        throw new NotFoundException(`Resource not found: ${dto.resourceId}`);
      }
      return { type: MassIntroductionTargetType.RESOURCE, id: resource.id, name: resource.name };
    }
    const group = await this.resourceGroupRepository.findOne({ where: { id: dto.resourceGroupId } });
    if (!group) {
      throw new NotFoundException(`Resource group not found: ${dto.resourceGroupId}`);
    }
    return { type: MassIntroductionTargetType.GROUP, id: group.id, name: group.name };
  }

  protected isIntroducer(target: MassIntroductionTarget, userId: number): Promise<boolean> {
    return target.type === MassIntroductionTargetType.RESOURCE
      ? this.resourceIntroducers.isIntroducer(target.id, userId, true)
      : this.groupIntroducers.isIntroducer({ groupId: target.id, userId });
  }

  protected getOwned(sessionId: string, userId: number): ActiveMassIntroduction {
    const session = this.sessions.get(sessionId);
    // Someone else's session is reported as missing so its id cannot be probed.
    if (!session || session.introducer.id !== userId) {
      throw new NotFoundException('Mass introduction not found');
    }
    return session;
  }

  protected expire(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.end(session, MassIntroductionEndReason.EXPIRED);
    }
  }

  protected end(
    session: ActiveMassIntroduction,
    reason: MassIntroductionEndReason,
    options: { silent?: boolean } = {},
  ): void {
    if (this.sessions.get(session.id) !== session) {
      return;
    }
    clearTimeout(session.timeout);
    this.sessions.delete(session.id);
    this.sessionIdsByPublicId.delete(session.publicId);

    if (session.reader?.state === MassIntroductionReaderState.ACTIVE) {
      this.readerPort?.disarm({ readerId: session.reader.id, sessionId: session.id, reason });
    }
    if (!options.silent) {
      this.live.emitToIntroducer(session.introducer.id, {
        type: MassIntroductionLiveEventType.ENDED,
        sessionId: session.id,
        session: null,
        reason,
      });
    }
    this.logger.log(`Mass introduction ${session.id} ended (${reason})`);
  }

  protected emitUpdated(session: ActiveMassIntroduction): void {
    this.live.emitToIntroducer(session.introducer.id, {
      type: MassIntroductionLiveEventType.UPDATED,
      sessionId: session.id,
      session: this.toDto(session),
    });
  }

  protected toDto(session: ActiveMassIntroduction): MassIntroductionSessionDto {
    const code = currentMassIntroductionCode(session.codeSecret);
    return {
      id: session.id,
      token: `${session.publicId}.${code.code}`,
      tokenRefreshAt: code.refreshAt,
      target: { ...session.target },
      reader: session.reader ? { ...session.reader } : null,
      participants: Array.from(session.participants.values(), (participant) => ({ ...participant })),
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    };
  }
}
