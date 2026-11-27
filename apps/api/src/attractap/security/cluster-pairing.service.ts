import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ClusterService } from '../../cluster/cluster.service';
import { ClusterInstanceGoneError, ClusterRequestTimeoutError } from '../../cluster/cluster-errors';
import { orServiceUnavailable, valkeyCall } from '../../cluster/valkey-call';
import { ENROLLMENT_REQUEST_TTL_MS } from '../../device-enrollment/device-enrollment.constants';
import { EnrollmentLimitsService } from '../../device-enrollment/enrollment-limits.service';
import { EnrollmentRateLimitedException } from '../../device-enrollment/enrollment-rate-limited.exception';
import type { Actor, ApproveInput, PairingView } from './pairing-model';
import { PairingService, resolveCodeAmong, TERMINAL_VISIBLE_MS } from './pairing.service';

/** Which instance holds the pairing socket of a request; outlives the request by the time it stays visible. */
const holderKey = (id: string) => `attraccess:pairing:request:${id}`;
const HOLDER_TTL_MS = ENROLLMENT_REQUEST_TTL_MS + TERMINAL_VISIBLE_MS;
const ASK_TIMEOUT_MS = 5_000;
/** The approval writes the reader, issues its certificate and waits for the reader to take it. */
const APPROVE_TIMEOUT_MS = 30_000;
export const PAIRING_INSTANCE_UNAVAILABLE_MESSAGE = 'An API instance did not answer; try again shortly';

const MESSAGES = {
  list: 'pairing.list',
  match: 'pairing.match',
  get: 'pairing.get',
  approve: 'pairing.approve',
  cancel: 'pairing.cancel',
} as const;

interface ApprovePayload {
  id: string;
  input: ApproveInput;
  actor: Actor;
  matchesElsewhere: number;
}

/** Dates arrive as strings from another instance. */
function revive(view: PairingView): PairingView {
  return { ...view, createdAt: new Date(view.createdAt), expiresAt: new Date(view.expiresAt) };
}

/** A remote 429 crosses as a plain HttpException; callers (and specs) expect the enrollment exception. */
function rehydrate(error: unknown): unknown {
  if (!(error instanceof HttpException) || error.getStatus() !== HttpStatus.TOO_MANY_REQUESTS) return error;
  const response = error.getResponse() as { retryAfterSeconds?: unknown };
  return typeof response?.retryAfterSeconds === 'number'
    ? new EnrollmentRateLimitedException(response.retryAfterSeconds)
    : error;
}

/**
 * The admin side of reader pairing across API instances (ATT-1163). A request lives on the instance that holds the
 * reader's pairing socket: lists and code lookups ask every live instance, everything about one request runs on its
 * holder, so the single-use approval guard and the `accepted` delivery stay local. Without Valkey it passes through
 * to {@link PairingService}.
 */
@Injectable()
export class ClusterPairingService {
  private readonly logger = new Logger(ClusterPairingService.name);
  private readonly cluster: ClusterService;

  public constructor(
    private readonly pairing: PairingService,
    private readonly limits: EnrollmentLimitsService,
    @Optional() cluster?: ClusterService,
  ) {
    this.cluster = cluster ?? ClusterService.local();
    if (!this.cluster.enabled) return;
    const bus = this.cluster.bus;
    bus.handle(MESSAGES.list, () => this.pairing.list());
    bus.handle(MESSAGES.match, (payload) => this.pairing.matchCode((payload as { code: string }).code));
    bus.handle(MESSAGES.get, (payload) => this.pairing.get((payload as { id: string }).id));
    bus.handle(MESSAGES.approve, (payload) => {
      const { id, input, actor, matchesElsewhere } = payload as ApprovePayload;
      // Answered here, so the 503 crosses as itself instead of an anonymous error.
      return orServiceUnavailable(this.pairing.approve(id, input, actor, matchesElsewhere));
    });
    bus.handle(MESSAGES.cancel, (payload) => {
      const { id, actor } = payload as { id: string; actor: Actor };
      return this.pairing.cancel(id, actor);
    });
    this.pairing.onRequestCreated((id) => void this.rememberHolder(id));
  }

  public async list(): Promise<PairingView[]> {
    if (!this.cluster.enabled) return this.pairing.list();
    const answers = await orServiceUnavailable(this.everyInstance<PairingView[]>(MESSAGES.list, null, false));
    return answers
      .flat()
      .map(revive)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  public async get(id: string): Promise<PairingView> {
    if (!this.cluster.enabled) return this.pairing.get(id);
    return orServiceUnavailable(
      (async () => revive(await this.ask(await this.holderOf(id), MESSAGES.get, { id }, ASK_TIMEOUT_MS)))(),
    );
  }

  /** As {@link PairingService.resolve}, over the waiting readers of every instance. */
  public async resolve(rawCode: string, actor: Actor): Promise<PairingView> {
    if (!this.cluster.enabled) return this.pairing.resolve(rawCode, actor);
    return orServiceUnavailable(
      resolveCodeAmong(this.limits, actor, async () =>
        (await this.everyInstance<PairingView[]>(MESSAGES.match, { code: rawCode }, true)).flat(),
      ).then(revive),
    );
  }

  public async approve(id: string, input: ApproveInput, actor: Actor): Promise<PairingView> {
    if (!this.cluster.enabled) return this.pairing.approve(id, input, actor);
    return orServiceUnavailable(
      (async () => {
        // First, as on one instance: a throttled approver learns nothing about the request.
        await this.limits.assertApproverAllowed(actor.userId);
        const holder = await this.holderOf(id);
        const matchesElsewhere =
          input.code === undefined
            ? 0
            : (await this.everyInstance<PairingView[]>(MESSAGES.match, { code: input.code }, true, holder)).flat()
                .length;
        const payload: ApprovePayload = { id, input, actor, matchesElsewhere };
        return revive(await this.ask(holder, MESSAGES.approve, payload, APPROVE_TIMEOUT_MS));
      })(),
    );
  }

  public async cancel(id: string, actor: Actor): Promise<void> {
    if (!this.cluster.enabled) return this.pairing.cancel(id, actor);
    await orServiceUnavailable(
      (async () => this.ask<void>(await this.holderOf(id), MESSAGES.cancel, { id, actor }, ASK_TIMEOUT_MS))(),
    );
  }

  /** Reader side: a failed write only costs the other instances a lookup (see {@link holderOf}). */
  private async rememberHolder(id: string): Promise<void> {
    const valkey = this.cluster.valkey;
    if (!valkey) return;
    try {
      await valkeyCall(valkey, () => valkey.set(holderKey(id), this.cluster.instanceId, 'PX', HOLDER_TTL_MS));
    } catch (error) {
      this.logger.warn(`Could not record where pairing ${id} is held: ${(error as Error).message}`);
    }
  }

  private async holderOf(id: string): Promise<string> {
    const valkey = this.cluster.valkey as NonNullable<ClusterService['valkey']>;
    const holder = await valkeyCall(valkey, () => valkey.get(holderKey(id)));
    if (holder) {
      // The reader's socket went down with its instance.
      if (!(await this.cluster.instances.isAlive(holder))) throw new NotFoundException('Pairing not found');
      return holder;
    }
    // No record (Valkey was away when the reader said hello, or the id is unknown): ask every instance.
    const live = await this.cluster.instances.live();
    const answers = await Promise.allSettled(
      live.map((instanceId) => this.cluster.bus.request(instanceId, MESSAGES.get, { id }, ASK_TIMEOUT_MS)),
    );
    const found = answers.findIndex((answer) => answer.status === 'fulfilled');
    if (found >= 0) return live[found];
    const failed = answers.find(
      (answer) =>
        answer.status === 'rejected' &&
        !(answer.reason instanceof NotFoundException) &&
        !(answer.reason instanceof ClusterInstanceGoneError),
    ) as PromiseRejectedResult | undefined;
    if (failed) throw this.unavailable(MESSAGES.get, failed.reason);
    throw new NotFoundException('Pairing not found');
  }

  /** One request to the holder; its HTTP errors come back as they were thrown there. */
  private async ask<T>(instanceId: string, type: string, payload: unknown, timeoutMs: number): Promise<T> {
    try {
      return await this.cluster.bus.request<T>(instanceId, type, payload, timeoutMs);
    } catch (error) {
      if (error instanceof ClusterInstanceGoneError) throw new NotFoundException('Pairing not found');
      throw this.unavailable(type, rehydrate(error));
    }
  }

  /**
   * Asks every live instance (but `except`). An instance that went away held no reader any more. `strict`: any other
   * failure fails the whole question, since a missing answer could hide the reader that shows a code (and must not
   * count as a wrong code); otherwise it is logged and left out.
   */
  private async everyInstance<T>(type: string, payload: unknown, strict: boolean, except?: string): Promise<T[]> {
    const live = (await this.cluster.instances.live()).filter((instanceId) => instanceId !== except);
    const settled = await Promise.allSettled(
      live.map((instanceId) => this.cluster.bus.request<T>(instanceId, type, payload, ASK_TIMEOUT_MS)),
    );
    const answers: T[] = [];
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') return void answers.push(result.value);
      if (result.reason instanceof ClusterInstanceGoneError) return;
      if (strict) throw this.unavailable(type, result.reason);
      this.logger.warn(`Instance ${live[index]} did not answer ${type}: ${(result.reason as Error).message}`);
    });
    return answers;
  }

  /** A silent instance is a 503; anything else stays what it was (orServiceUnavailable maps a lost Valkey). */
  private unavailable(type: string, error: unknown): unknown {
    if (!(error instanceof ClusterRequestTimeoutError)) return error;
    this.logger.warn(`Cluster pairing ${type}: ${error.message}`);
    return new ServiceUnavailableException(PAIRING_INSTANCE_UNAVAILABLE_MESSAGE);
  }
}
