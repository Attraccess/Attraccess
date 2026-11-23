import { formatUserDisplayName } from '@attraccess/shared';
import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { ResourceIntroductionsService } from '../introductions/resouceIntroductions.service';
import { ResourceIntroducersService } from '../introducers/resourceIntroducers.service';
import { ResourceGroupsIntroductionsService } from '../groups/introductions/resourceGroups.introductions.service';
import { ResourceGroupsIntroducersService } from '../groups/introducers/resourceGroups.introducers.service';
import {
  MASS_INTRODUCTION_TARGET_STORE,
  type MassIntroductionTargetStore,
} from './mass-introduction-target-store.port';
import { MassIntroductionLiveService } from './mass-introduction-live.service';
import { ClusterService } from '../../cluster/cluster.service';
import { orServiceUnavailable } from '../../cluster/valkey-call';
import {
  MassIntroductionParticipant,
  MassIntroductionReaderPort,
  MassIntroductionTarget,
} from './mass-introduction.types';
import {
  InMemoryMassIntroductionStore,
  type MassIntroductionStore,
  type StoredMassIntroduction,
} from './mass-introduction-store';
import { ValkeyMassIntroductionStore } from './valkey-mass-introduction-store';
import {
  MassIntroductionMethod,
  MassIntroductionReaderState,
  MassIntroductionSessionDto,
  MassIntroductionTargetType,
} from './dtos/massIntroductionSession.dto';
import { MassIntroductionEndReason, MassIntroductionLiveEventType } from './dtos/massIntroductionLiveEvent.dto';
import { StartMassIntroductionDto } from './dtos/startMassIntroduction.dto';
import { RedeemMassIntroductionResponseDto } from './dtos/redeemMassIntroduction.dto';
import {
  currentMassIntroductionCode,
  isValidMassIntroductionCode,
  newMassIntroductionCodeSecret,
} from './mass-introduction-codes';

/**
 * Short-lived sessions in which an introducer introduces everyone who scans a QR code, or taps a
 * card at a chosen reader, to one resource or resource group (ATT-1151).
 *
 * Sessions last 15 minutes and are worthless after they end, so they are never persisted: one API
 * instance keeps them in memory, several share them in Valkey (ATT-1163), where they survive the
 * restart of any one instance. The expiry fires exactly once, on whichever instance sweeps it.
 */
/** The user as the service needs it; the names are optional so callers with only a username keep working. */
type MassIntroductionUser = { id: number; username: string; firstName?: string | null; lastName?: string | null };

const EXPIRY_QUEUE = 'mass-introduction';

@Injectable()
export class MassIntroductionService {
  public static readonly TTL_MS = 15 * 60_000;

  /** Per participant and session, so nobody can lock others out by guessing. */
  public static readonly MAX_WRONG_CODES_PER_MINUTE = 5;

  protected readonly logger = new Logger(MassIntroductionService.name);

  protected readonly store: MassIntroductionStore;

  protected readonly cluster: ClusterService;

  protected readerPort: MassIntroductionReaderPort | null = null;

  constructor(
    protected readonly resourceIntroductions: ResourceIntroductionsService,
    protected readonly resourceIntroducers: ResourceIntroducersService,
    protected readonly groupIntroductions: ResourceGroupsIntroductionsService,
    protected readonly groupIntroducers: ResourceGroupsIntroducersService,
    protected readonly live: MassIntroductionLiveService,
    @Inject(MASS_INTRODUCTION_TARGET_STORE) protected readonly targets: MassIntroductionTargetStore,
    @Optional() cluster?: ClusterService,
  ) {
    this.cluster = cluster ?? ClusterService.local();
    const max = MassIntroductionService.MAX_WRONG_CODES_PER_MINUTE;
    this.store = this.cluster.valkey
      ? new ValkeyMassIntroductionStore(this.cluster.valkey, max)
      : new InMemoryMassIntroductionStore(max);
    this.cluster.deadlines.onDue(EXPIRY_QUEUE, (sessionId) => this.end(sessionId, MassIntroductionEndReason.EXPIRED));
  }

  /** Registered by the Attractap module at startup; see {@link MassIntroductionReaderPort}. */
  public setReaderPort(port: MassIntroductionReaderPort): void {
    this.readerPort = port;
  }

  public async start(user: AuthenticatedUser, dto: StartMassIntroductionDto): Promise<MassIntroductionSessionDto> {
    const { target, viaPermission } = await this.authorizeTarget(user, dto);
    return orServiceUnavailable(this.startFor(user, dto, target, viaPermission));
  }

  protected async startFor(
    user: AuthenticatedUser,
    dto: StartMassIntroductionDto,
    target: MassIntroductionTarget,
    viaPermission: boolean,
  ): Promise<MassIntroductionSessionDto> {
    // One session per introducer and target: starting again replaces the old QR code — but only once
    // the replacement works, so a start that fails (offline or busy reader) keeps the running one.
    const replaced = await this.store.findForIntroducer(user.id, target);
    // A session holding the requested reader has to let go of it first, or arming would find it busy.
    for (const existing of replaced) {
      if (existing.reader?.state === MassIntroductionReaderState.ACTIVE && existing.reader.id === dto.readerId) {
        await this.end(existing.id, MassIntroductionEndReason.CANCELLED);
      }
    }

    const now = Date.now();
    const session: StoredMassIntroduction = {
      id: randomUUID(),
      publicId: randomBytes(12).toString('base64url'),
      codeSecret: newMassIntroductionCodeSecret(),
      target,
      introducer: {
        id: user.id,
        username: user.username,
        displayName: formatUserDisplayName(user),
        authenticationMethod: user.authenticationMethod ?? null,
        apiTokenId: user.apiTokenId ?? null,
        viaPermission,
      },
      reader: null,
      createdAt: now,
      expiresAt: now + MassIntroductionService.TTL_MS,
    };
    await this.store.create(session);
    await this.cluster.deadlines.schedule(EXPIRY_QUEUE, session.id, session.expiresAt);

    if (dto.readerId != null) {
      await this.attachReader(session, user, dto.readerId);
    }

    for (const existing of replaced) {
      await this.end(existing.id, MassIntroductionEndReason.CANCELLED);
    }

    this.logger.log(
      `User ${user.id} started mass introduction ${session.id} for ${target.type} ${target.id}` +
        (session.reader ? ` with reader ${session.reader.id}` : ''),
    );
    return this.toDto(session);
  }

  protected async attachReader(session: StoredMassIntroduction, user: AuthenticatedUser, readerId: number) {
    if (!this.readerPort) {
      await this.end(session.id, MassIntroductionEndReason.CANCELLED, { silent: true });
      throw new ServiceUnavailableException('Reader integration is not available');
    }
    let readerName: string;
    try {
      ({ readerName } = await this.readerPort.arm({
        readerId,
        allowedResourceIds: await this.linkedResourceIds(session.target),
        sessionId: session.id,
        targetName: session.target.name,
        introducerUsername: user.username,
        introducerDisplayName: formatUserDisplayName(user),
        expiresAt: new Date(session.expiresAt),
      }));
    } catch (error) {
      await this.end(session.id, MassIntroductionEndReason.CANCELLED, { silent: true });
      throw error;
    }
    // A concurrent start may have replaced this session while the reader was being armed; its
    // end() could not disarm a reader it did not know about yet.
    const reader = { id: readerId, name: readerName, state: MassIntroductionReaderState.ACTIVE };
    if (!(await this.store.attachReader(session.id, reader))) {
      this.readerPort.disarm({ readerId, sessionId: session.id, reason: MassIntroductionEndReason.CANCELLED });
      throw new GoneException('The mass introduction was replaced while starting');
    }
    session.reader = reader;
  }

  public async get(sessionId: string, userId: number): Promise<MassIntroductionSessionDto> {
    return orServiceUnavailable(this.getOwned(sessionId, userId).then((session) => this.toDto(session)));
  }

  public async cancel(sessionId: string, userId: number): Promise<void> {
    await orServiceUnavailable(
      this.getOwned(sessionId, userId).then((session) => this.end(session.id, MassIntroductionEndReason.CANCELLED)),
    );
  }

  /**
   * A participant scanned the QR code (which only names the session) and typed the code shown next
   * to it. The code changes every 15 seconds, so only people in the room can join.
   */
  public redeem(
    publicId: string,
    code: string,
    user: MassIntroductionUser,
    nowMs = Date.now(),
  ): Promise<RedeemMassIntroductionResponseDto> {
    return orServiceUnavailable(this.redeemCode(publicId, code, user, nowMs));
  }

  protected async redeemCode(
    publicId: string,
    code: string,
    user: MassIntroductionUser,
    nowMs: number,
  ): Promise<RedeemMassIntroductionResponseDto> {
    const session = await this.store.getByPublicId(publicId);
    if (!session) {
      throw new NotFoundException('This mass introduction has ended');
    }
    const existing = await this.store.participant(session.id, user.id);
    if (existing) {
      return { target: { ...session.target }, alreadyIntroduced: existing.alreadyIntroduced };
    }

    const tooManyWrongCodes = () =>
      new HttpException('Too many wrong codes, try again in a minute', HttpStatus.TOO_MANY_REQUESTS);
    if (!isValidMassIntroductionCode(session.codeSecret, code, nowMs)) {
      // Counted atomically, so guesses spread over several instances share the one limit.
      if (!(await this.store.countWrongCode(session.id, user.id, nowMs))) throw tooManyWrongCodes();
      throw new BadRequestException('Wrong or expired code');
    }
    if (await this.store.wrongCodesExhausted(session.id, user.id, nowMs)) throw tooManyWrongCodes();
    await this.store.clearWrongCodes(session.id, user.id);

    const participant = await this.join(session, user, MassIntroductionMethod.QR);
    return { target: { ...session.target }, alreadyIntroduced: participant.alreadyIntroduced };
  }

  /** A participant tapped an authenticated card at the session's reader. */
  public redeemCard(
    sessionId: string,
    readerId: number,
    user: MassIntroductionUser,
  ): Promise<{ participant: MassIntroductionParticipant; participantCount: number }> {
    return orServiceUnavailable(this.redeemCardAt(sessionId, readerId, user));
  }

  protected async redeemCardAt(
    sessionId: string,
    readerId: number,
    user: MassIntroductionUser,
  ): Promise<{ participant: MassIntroductionParticipant; participantCount: number }> {
    const session = await this.store.get(sessionId);
    if (!session || session.reader?.id !== readerId || session.reader.state !== MassIntroductionReaderState.ACTIVE) {
      throw new NotFoundException('NO_MASS_INTRODUCTION_IN_PROGRESS');
    }
    const participant = await this.join(session, user, MassIntroductionMethod.NFC);
    return { participant, participantCount: (await this.store.participants(session.id)).length };
  }

  /** The reader left the session (cancel button, disconnect, its instance died); the QR code keeps working. */
  public async detachReader(sessionId: string, readerId: number): Promise<void> {
    const session = await this.store.detachReader(sessionId, readerId);
    if (session) await this.emitUpdated(session);
  }

  protected async join(
    session: StoredMassIntroduction,
    user: MassIntroductionUser,
    method: MassIntroductionMethod,
  ): Promise<MassIntroductionParticipant> {
    if (session.expiresAt <= Date.now()) {
      await this.end(session.id, MassIntroductionEndReason.EXPIRED);
      throw new NotFoundException('This mass introduction has expired');
    }

    const { participant, added } = await this.store.joinOnce(session.id, user.id, () =>
      this.grant(session, user, method),
    );
    if (added) {
      const current = await this.store.get(session.id);
      if (current) await this.emitUpdated(current);
    }
    return participant;
  }

  protected async grant(
    session: StoredMassIntroduction,
    user: MassIntroductionUser,
    method: MassIntroductionMethod,
  ): Promise<MassIntroductionParticipant> {
    const { target, introducer } = session;

    if (!introducer.viaPermission && !(await this.isIntroducer(target, introducer.id))) {
      await this.end(session.id, MassIntroductionEndReason.REVOKED);
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

    return {
      userId: user.id,
      username: user.username,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      displayName: formatUserDisplayName(user),
      method,
      alreadyIntroduced,
      joinedAt: new Date(),
    };
  }

  protected async authorizeTarget(
    user: AuthenticatedUser,
    dto: Pick<StartMassIntroductionDto, 'resourceId' | 'resourceGroupId'>,
  ): Promise<{ target: MassIntroductionTarget; viaPermission: boolean }> {
    if ((dto.resourceId == null) === (dto.resourceGroupId == null)) {
      throw new BadRequestException('Provide exactly one of resourceId and resourceGroupId');
    }
    const viaPermission = user.effectivePermissions?.has('resources.access.manage') === true;
    const notIntroducer = () => new ForbiddenException('You are not an introducer for this target');
    // Without the permission, a missing target answers like one the caller does not introduce, so the answer does
    // not tell which machine ids exist (ATT-843).
    const target = await this.loadTarget(dto).catch((error: unknown) => {
      throw !viaPermission && error instanceof NotFoundException ? notIntroducer() : error;
    });
    if (!viaPermission && !(await this.isIntroducer(target, user.id))) {
      throw notIntroducer();
    }
    return { target, viaPermission };
  }

  /** The target resource, or every resource of the target group. */
  protected async linkedResourceIds(target: MassIntroductionTarget): Promise<number[]> {
    if (target.type === MassIntroductionTargetType.RESOURCE) {
      return [target.id];
    }
    return this.targets.resourceIdsOfGroup(target.id);
  }

  protected async loadTarget(
    dto: Pick<StartMassIntroductionDto, 'resourceId' | 'resourceGroupId'>,
  ): Promise<MassIntroductionTarget> {
    if (dto.resourceId != null) {
      const resource = await this.targets.findResourceName(dto.resourceId);
      if (!resource) {
        throw new NotFoundException(`Resource not found: ${dto.resourceId}`);
      }
      return { type: MassIntroductionTargetType.RESOURCE, id: resource.id, name: resource.name };
    }
    const group = await this.targets.findGroupName(dto.resourceGroupId);
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

  protected async getOwned(sessionId: string, userId: number): Promise<StoredMassIntroduction> {
    const session = await this.store.get(sessionId);
    // Someone else's session is reported as missing so its id cannot be probed.
    if (!session || session.introducer.id !== userId) {
      throw new NotFoundException('Mass introduction not found');
    }
    return session;
  }

  /** Ends a session exactly once, whichever instance or path (cancel, expiry, replacement, revocation) gets there first. */
  protected async end(
    sessionId: string,
    reason: MassIntroductionEndReason,
    options: { silent?: boolean } = {},
  ): Promise<void> {
    const session = await this.store.remove(sessionId);
    if (!session) {
      return;
    }
    void this.cluster.deadlines.cancel(EXPIRY_QUEUE, session.id).catch(() => undefined);

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

  protected async emitUpdated(session: StoredMassIntroduction): Promise<void> {
    this.live.emitToIntroducer(session.introducer.id, {
      type: MassIntroductionLiveEventType.UPDATED,
      sessionId: session.id,
      session: await this.toDto(session),
    });
  }

  protected async toDto(session: StoredMassIntroduction): Promise<MassIntroductionSessionDto> {
    const code = currentMassIntroductionCode(session.codeSecret);
    const participants = await this.store.participants(session.id);
    return {
      id: session.id,
      publicId: session.publicId,
      code: code.code,
      codeRefreshAt: code.refreshAt,
      target: { ...session.target },
      reader: session.reader ? { ...session.reader } : null,
      participants: participants.map((participant) => ({ ...participant })),
      createdAt: new Date(session.createdAt),
      expiresAt: new Date(session.expiresAt),
    };
  }
}
