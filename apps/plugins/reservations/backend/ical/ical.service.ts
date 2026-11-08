import type { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Clock, PLUGIN_CONTEXT, RESERVATION_CLOCK } from '../constants';
import { IcalFeedEntity } from '../entities/ical-feed.entity';
import { HostInfoService } from '../notifications/host-info.service';
import { pick } from '../notifications/format';
import { AccessService } from '../reservations/access.service';
import { mapWithConcurrency } from '../reservations/concurrency';
import { DirectoryService } from '../reservations/directory.service';
import { ReservationError } from '../reservations/errors';
import { ReservationAudit } from '../reservations/audit';
import { ReservationStore } from '../reservations/reservation.store';
import { GlobalSettingsService } from '../settings/global-settings.service';
import { ResourceSettingsService } from '../settings/resource-settings.service';
import { IcalEvent, buildCalendar } from './ical-format';
import type { IcalFeedDto, IcalFeedSecretDto, IcalSelectionDto } from './ical.dto';
import { VisibilityService } from './visibility.service';

const DAY_MS = 86_400_000;
export const PAST_DAYS = 30;
export const MAX_FEEDS_PER_USER = 20;
const TOKEN_PREFIX_LENGTH = 6;
/** Parallel `canStart` lookups for the "all introduced" selector. */
const INTRODUCED_LOOKUP_CONCURRENCY = 8;
/** Shape of every token this service issues (base64url); anything else is answered 404 without a lookup. */
export const FEED_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export function parseSelection(raw: string): IcalSelectionDto {
  try {
    const value = JSON.parse(raw) as Partial<IcalSelectionDto>;
    return {
      resourceIds: Array.isArray(value.resourceIds) ? value.resourceIds.filter(Number.isInteger) : [],
      groupIds: Array.isArray(value.groupIds) ? value.groupIds.filter(Number.isInteger) : [],
      introduced: value.introduced === true,
      maintained: value.maintained === true,
      ownOnly: value.ownOnly === true,
    };
  } catch {
    return { resourceIds: [], groupIds: [], introduced: false, maintained: false, ownOnly: false };
  }
}

export function assertSelection(selection: IcalSelectionDto): IcalSelectionDto {
  const clean: IcalSelectionDto = {
    resourceIds: [...new Set(selection.resourceIds)],
    groupIds: [...new Set(selection.groupIds)],
    introduced: selection.introduced,
    maintained: selection.maintained,
    ownOnly: selection.ownOnly,
  };
  if (!clean.resourceIds.length && !clean.groupIds.length && !clean.introduced && !clean.maintained && !clean.ownOnly) {
    throw new ReservationError('INVALID_FEED', 'Select at least one resource, group, or option for the feed');
  }
  return clean;
}

/** iCal feed management (owner only) and rendering (token holder). */
@Injectable()
export class IcalService {
  private readonly audit: ReservationAudit;

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(ReservationStore) private readonly store: ReservationStore,
    @Inject(ResourceSettingsService) private readonly settings: ResourceSettingsService,
    @Inject(GlobalSettingsService) private readonly globalSettings: GlobalSettingsService,
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(DirectoryService) private readonly directory: DirectoryService,
    @Inject(VisibilityService) private readonly visibility: VisibilityService,
    @Inject(HostInfoService) private readonly hostInfo: HostInfoService,
    @Inject(RESERVATION_CLOCK) private readonly clock: Clock,
  ) {
    this.audit = new ReservationAudit(context.audit);
  }

  private get repo() {
    return this.context.getRepository(IcalFeedEntity);
  }

  /** Writes go through the host's serialized queue so concurrent requests never hit SQLITE_BUSY. */
  private save(feed: IcalFeedEntity): Promise<IcalFeedEntity> {
    return this.context.runSerialized((manager) => manager.getRepository(IcalFeedEntity).save(feed));
  }

  private toDto(feed: IcalFeedEntity): IcalFeedDto {
    return {
      id: feed.id,
      name: feed.name,
      selection: parseSelection(feed.selection),
      tokenPrefix: feed.tokenPrefix,
      createdAt: feed.createdAt.toISOString(),
      lastUsedAt: feed.lastUsedAt ? feed.lastUsedAt.toISOString() : null,
    };
  }

  private async secretResult(feed: IcalFeedEntity, token: string): Promise<IcalFeedSecretDto> {
    const base = (await this.hostInfo.getBaseUrl()) ?? '';
    return { feed: this.toDto(feed), url: `${base}/api/reservations/ical/${token}.ics`, token };
  }

  private async load(userId: number, id: number): Promise<IcalFeedEntity> {
    const feed = await this.repo.findOneBy({ id, userId });
    if (!feed || feed.revokedAt) throw new ReservationError('FEED_NOT_FOUND', 'Feed not found');
    return feed;
  }

  async list(userId: number): Promise<IcalFeedDto[]> {
    const feeds = await this.repo
      .createQueryBuilder('f')
      .where('f.userId = :userId AND f.revokedAt IS NULL', { userId })
      .orderBy('f.createdAt', 'ASC')
      .getMany();
    return feeds.map((feed) => this.toDto(feed));
  }

  async create(
    actor: PluginAuditPrincipal,
    input: { name: string; selection: IcalSelectionDto },
  ): Promise<IcalFeedSecretDto> {
    const selection = assertSelection(input.selection);
    const count = await this.repo
      .createQueryBuilder('f')
      .where('f.userId = :userId AND f.revokedAt IS NULL', { userId: actor.userId })
      .getCount();
    if (count >= MAX_FEEDS_PER_USER) {
      throw new ReservationError('FEED_LIMIT', `You can have at most ${MAX_FEEDS_PER_USER} calendar feeds`);
    }
    const token = randomBytes(32).toString('base64url');
    const feed = await this.save(
      Object.assign(new IcalFeedEntity(), {
        userId: actor.userId,
        name: input.name.trim(),
        tokenHash: hashToken(token),
        tokenPrefix: token.slice(0, TOKEN_PREFIX_LENGTH),
        selection: JSON.stringify(selection),
        createdAt: this.clock(),
        revokedAt: null,
        lastUsedAt: null,
      }),
    );
    await this.audit.record('feed_created', actor, { type: 'feed', id: feed.id }, { feedName: feed.name });
    return this.secretResult(feed, token);
  }

  async update(
    actor: PluginAuditPrincipal,
    id: number,
    input: { name?: string; selection?: IcalSelectionDto },
  ): Promise<IcalFeedDto> {
    const feed = await this.load(actor.userId, id);
    if (input.name !== undefined) feed.name = input.name.trim();
    if (input.selection !== undefined) feed.selection = JSON.stringify(assertSelection(input.selection));
    return this.toDto(await this.save(feed));
  }

  /** New token; the old one stops working immediately (its hash is overwritten). */
  async regenerate(actor: PluginAuditPrincipal, id: number): Promise<IcalFeedSecretDto> {
    const feed = await this.load(actor.userId, id);
    const token = randomBytes(32).toString('base64url');
    feed.tokenHash = hashToken(token);
    feed.tokenPrefix = token.slice(0, TOKEN_PREFIX_LENGTH);
    feed.lastUsedAt = null;
    return this.secretResult(await this.save(feed), token);
  }

  async revoke(actor: PluginAuditPrincipal, id: number): Promise<void> {
    const feed = await this.load(actor.userId, id);
    feed.revokedAt = this.clock();
    await this.save(feed);
    await this.audit.record('feed_revoked', actor, { type: 'feed', id: feed.id }, { feedName: feed.name });
  }

  // ------------------------------------------------------------- rendering

  /**
   * The calendar for a token, or null for an unknown/revoked token or when the owner's account is deleted or
   * disabled (their roles would otherwise keep exposing data). Resources are resolved NOW.
   */
  async renderForToken(token: string): Promise<string | null> {
    if (!FEED_TOKEN_PATTERN.test(token)) return null;
    const feed = await this.repo.findOneBy({ tokenHash: hashToken(token) });
    if (!feed || feed.revokedAt) return null;
    if (!(await this.visibility.isActiveAccount(feed.userId))) return null;
    const now = this.clock();
    if (!feed.lastUsedAt || now.getTime() - feed.lastUsedAt.getTime() > 60_000) {
      await this.context
        .runSerialized((manager) => manager.getRepository(IcalFeedEntity).update({ id: feed.id }, { lastUsedAt: now }))
        .catch(() => undefined);
    }
    return this.render(feed, now);
  }

  private async candidateResourceIds(feed: IcalFeedEntity, selection: IcalSelectionDto): Promise<number[]> {
    const enabledIds = this.settings.getEnabledResourceIds();
    const enabled = new Set(enabledIds);
    const hasSelectors =
      selection.resourceIds.length > 0 || selection.groupIds.length > 0 || selection.introduced || selection.maintained;
    if (!hasSelectors) return enabledIds; // "only my own bookings" alone: every resource
    const selected = new Set<number>();
    const add = (ids: number[]) => ids.filter((id) => enabled.has(id)).forEach((id) => selected.add(id));
    add(selection.resourceIds);
    add(await this.visibility.resourceIdsOfGroups(selection.groupIds));
    if (selection.maintained) add(await this.context.resourceAccess.listResourceIdsMaintained(feed.userId));
    // Only enabled resources that are not selected anyway need the (per-resource) introduction check.
    if (selection.introduced)
      add(
        await this.introducedAmong(
          feed.userId,
          enabledIds.filter((id) => !selected.has(id)),
        ),
      );
    return [...selected];
  }

  /**
   * The subset of `resourceIds` the user is introduced to, in the sense of `listResourceIdsIntroduced`
   * (core's `canControllResource`), checked per resource instead of across every resource of the host.
   * `canStart.allowed` is exactly that rule except on supervision-required resources, where it is always
   * false; only those fall back to the host-wide list.
   */
  private async introducedAmong(userId: number, resourceIds: number[]): Promise<number[]> {
    const results = await mapWithConcurrency(resourceIds, INTRODUCED_LOOKUP_CONCURRENCY, (id) =>
      this.context.resourceAccess.canStart(userId, id).catch(() => null),
    );
    const introduced: number[] = [];
    const undecided: number[] = [];
    resourceIds.forEach((id, index) => {
      const result = results[index];
      if (result?.allowed) introduced.push(id);
      else if (result?.supervisionAllowed) undecided.push(id);
    });
    const required = await this.visibility.resourceIdsRequiringSupervision(undecided);
    if (required.length > 0) {
      const all = new Set(await this.context.resourceAccess.listResourceIdsIntroduced(userId));
      introduced.push(...required.filter((id) => all.has(id)));
    }
    return introduced;
  }

  async render(feed: IcalFeedEntity, now: Date): Promise<string> {
    const selection = parseSelection(feed.selection);
    const [timeZone, languages] = await Promise.all([
      this.globalSettings.getTimezone(),
      this.hostInfo.languagesOf([feed.userId]),
    ]);
    const lang = languages.get(feed.userId) ?? 'en';
    const resourceIds = await this.visibility.filterVisible(
      feed.userId,
      await this.candidateResourceIds(feed, selection),
    );
    const maxAdvance = Math.max(0, ...resourceIds.map((id) => this.settings.getCachedSettings(id).maxAdvanceDays));
    const rows = await this.store.findForCalendar(
      resourceIds,
      new Date(now.getTime() - PAST_DAYS * DAY_MS),
      new Date(now.getTime() + maxAdvance * DAY_MS),
      selection.ownOnly ? feed.userId : undefined,
    );
    const inRange = rows.filter(
      (r) =>
        r.startTime.getTime() <= now.getTime() + this.settings.getCachedSettings(r.resourceId).maxAdvanceDays * DAY_MS,
    );
    // One lookup for all resources (null = manages everything); skipped when every row is the owner's own.
    const managed = inRange.some((r) => r.userId !== feed.userId)
      ? await this.access.managedResourceIds(feed.userId)
      : [];
    const managedIds = new Set(managed ?? []);
    const seesHolder = (r: { userId: number; resourceId: number }) =>
      r.userId === feed.userId || managed === null || managedIds.has(r.resourceId);
    // The holder's name also goes to viewers who may see the machine's current user (core's attribution rule);
    // notes stay with the holder and managers.
    const attributed = await this.access.attributionResourceIds(
      feed.userId,
      inRange.filter((r) => !seesHolder(r)).map((r) => r.resourceId),
    );
    const seesName = (r: { userId: number; resourceId: number }) => seesHolder(r) || attributed.has(r.resourceId);
    const [resourceNames, userNames] = await Promise.all([
      this.directory.getResourceNames(inRange.map((r) => r.resourceId)),
      this.directory.getUserNames(inRange.filter(seesName).map((r) => r.userId)),
    ]);
    const events: IcalEvent[] = inRange.map((r) => {
      const resource = resourceNames.get(r.resourceId) ?? `#${r.resourceId}`;
      const full = seesHolder(r);
      // The `#id` fallback (user row gone) only for viewers who may see the holder's id.
      const name = seesName(r) ? (userNames.get(r.userId) ?? (full ? `#${r.userId}` : null)) : null;
      const holder = name ?? pick(lang, 'Reserved', 'Reserviert');
      const lines = [
        ...(r.status === 'pending' ? [pick(lang, 'Waiting for approval', 'Wartet auf Genehmigung')] : []),
        ...(full && r.note ? [r.note] : []),
      ];
      return {
        uid: `reservation-${r.id}@attraccess`,
        start: r.startTime,
        end: r.endTime,
        stamp: now,
        summary: `${resource} – ${holder}`,
        description: lines.length ? lines.join('\n') : undefined,
        status: r.status === 'pending' ? 'TENTATIVE' : 'CONFIRMED',
      };
    });
    return buildCalendar({ name: feed.name, timeZone, events });
  }
}
