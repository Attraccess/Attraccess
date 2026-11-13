import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  READER_UI_LIMITS,
  READER_UI_TIMING,
  type PluginAccessPrincipal,
  type PluginBlockReason,
  type PluginChoice,
  type PluginConfirmation,
  type PreStartOrigin,
  type PreStartResult,
  type SessionEndResult,
  type StartBlockedState,
} from '@attraccess/plugins-backend-sdk';
import { AUDIT_RECORDER, AuditRecorder } from '../../audit/recorder/audit-event';
import type { AppConfigType } from '../../config/app.config';
import {
  cleanPluginText,
  validatePluginChoice,
  validatePluginConfirmation,
} from '../../resources/forms/reader-ui.validation';
import { HookRunner, NeutralResult, type BreakerTransition } from './hook-runner';
import { HOST_RESERVED_BLOCK_CODES, hostReason, type ReaderUiLanguage } from './host-texts';
import { ReaderUiAlertsService } from './reader-ui-alerts.service';
import { ReaderUiSettingsService } from './reader-ui-settings.service';
import { ReaderUiRegistry } from './reader-ui.registry';

export interface PreStartRun {
  resourceId: number;
  userId: number;
  /** Handed to the hooks: carries the request's permissions (API-token scope) for web and API starts. */
  principal: PluginAccessPrincipal;
  action: 'start' | 'takeover';
  projectId?: number;
  origin: PreStartOrigin;
  language: ReaderUiLanguage;
  readerId?: number;
  cardSessionId?: string;
  /** plugin -> stepKeys confirmed in this start attempt. */
  satisfied: Map<string, Set<string>>;
}

export interface SessionEndRun {
  resourceId: number;
  userId: number;
  sessionId: number;
  origin: 'web' | 'api' | 'reader';
  language: ReaderUiLanguage;
}

export type PreStartOutcome =
  | { decision: 'allow' }
  | { decision: 'block'; plugin: string; reason: PluginBlockReason }
  | { decision: 'confirm'; plugin: string; confirmation: PluginConfirmation };

export interface SessionEndQuestion {
  plugin: string;
  /** `choice.onAnswer` is host-guarded: it runs at most once, with the hook timeout, and never rejects. */
  result: { decision: 'choose'; choice: PluginChoice };
}

/** `auditCode` overrides the audited reason code; it never leaves this service. */
type NormalizedOutcome = PreStartOutcome & { auditCode?: string };

export interface StartBlockedRun {
  resourceId: number;
  userId: number;
  principal: PluginAccessPrincipal;
  language: ReaderUiLanguage;
}

/** A start refused right now, as shown in place of the start button. `until` is an ISO time. */
export interface StartBlockedView {
  plugin: string;
  reason: PluginBlockReason;
  until?: string;
}

/** The start-blocked query is informational, so its failures must never open the pre-start breaker. */
const startBlockedKey = (plugin: string) => `${plugin}#start-blocked`;

/** Session-end hooks are advisory, so their failures must never open the pre-start breaker. */
const sessionEndKey = (plugin: string) => `${plugin}#session-end`;

/** Runs plugin hooks with timeout, circuit breaker, failure policy and host audit. */
@Injectable()
export class ReaderUiHooksService {
  private readonly logger = new Logger(ReaderUiHooksService.name);
  private readonly runner: HookRunner;

  constructor(
    private readonly registry: ReaderUiRegistry,
    private readonly settings: ReaderUiSettingsService,
    private readonly alerts: ReaderUiAlertsService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    config: ConfigService,
  ) {
    const app = config.get<AppConfigType>('app');
    this.runner = new HookRunner({
      timeoutMs: Math.min(
        app?.READER_UI_HOOK_TIMEOUT_MS ?? READER_UI_TIMING.hookDefaultTimeoutMs,
        READER_UI_TIMING.hookMaxTimeoutMs,
      ),
      breakerThreshold: app?.READER_UI_BREAKER_THRESHOLD ?? READER_UI_TIMING.breakerThreshold,
      breakerProbeAfterMs: READER_UI_TIMING.breakerProbeAfterMs,
    });
    this.alerts.onCleared((alert) => {
      if (alert.kind === 'breaker-open' && alert.plugin) this.resetBreakers(alert.plugin);
    });
  }

  hasPreStartHooks(): boolean {
    return this.registry.preStartHooks().length > 0;
  }

  get timeoutMs(): number {
    return this.runner.timeoutMs;
  }

  async runPreStart(run: PreStartRun): Promise<PreStartOutcome> {
    let firstConfirm: PreStartOutcome | null = null;
    for (const { plugin, hook } of this.registry.preStartHooks()) {
      const confirmedStepKeys = [...(run.satisfied.get(plugin) ?? [])];
      const { result, transition, error } = await this.runner.run(
        plugin,
        () =>
          hook({
            resourceId: run.resourceId,
            userId: run.userId,
            principal: run.principal,
            action: run.action,
            projectId: run.projectId,
            origin: run.origin,
            confirmedStepKeys,
            language: run.language,
            now: new Date(),
          }),
        (raw) => this.normalize(plugin, raw, run),
      );
      await this.breakerChanged(plugin, transition, run);
      if (result.kind === 'failure') {
        this.logger.warn(`Pre-start hook of plugin ${plugin} failed (${result.code}): ${(error as Error)?.message}`);
        if ((await this.settings.failurePolicy(run.resourceId, plugin)) === 'fail-open') {
          await this.record(run, plugin, 'ui.fail_open_used', 'allow', result.code);
          continue;
        }
        await this.record(run, plugin, 'ui.hook_decision', 'block', result.code);
        return { decision: 'block', plugin, reason: hostReason('HOOK_UNAVAILABLE', run.language) };
      }
      const { auditCode, ...outcome } = result.value;
      await this.record(run, plugin, 'ui.hook_decision', outcome.decision, auditCode ?? decisionCode(outcome));
      if (outcome.decision === 'block') return outcome;
      if (outcome.decision === 'confirm') firstConfirm ??= outcome;
    }
    return firstConfirm ?? { decision: 'allow' };
  }

  /**
   * The query-side counterpart of {@link runPreStart}: the first plugin that reports a block. Informational only,
   * so a failing, slow or invalid query counts as "not blocked" (the pre-start gate still decides at start).
   */
  async queryStartBlocked(run: StartBlockedRun): Promise<StartBlockedView | null> {
    for (const { plugin, query } of this.registry.startBlockedQueries()) {
      const { result, error } = await this.runner.run(
        startBlockedKey(plugin),
        () => query({ ...run, now: new Date() }),
        (raw) => normalizeStartBlocked(raw),
      );
      if (result.kind === 'failure') {
        this.logger.debug(
          `Start-blocked query of plugin ${plugin} failed (${result.code}): ${(error as Error)?.message}`,
        );
        continue;
      }
      if (result.value.state) return { plugin, ...result.value.state };
    }
    return null;
  }

  /**
   * Advisory only. Every plugin's hook runs; the first valid question is returned, the other plugins get
   * their default right away. Failures and invalid results simply mean "no question" from that plugin.
   */
  async runSessionEnd(ctx: SessionEndRun): Promise<SessionEndQuestion | null> {
    let first: SessionEndQuestion | null = null;
    for (const { plugin, hook } of this.registry.sessionEndHooks()) {
      const { result, error } = await this.runner.run(
        sessionEndKey(plugin),
        () => hook({ ...ctx, now: new Date() }),
        (raw) => normalizeSessionEnd(raw),
      );
      if (result.kind === 'failure') {
        this.logger.warn(`Session-end hook of plugin ${plugin} failed (${result.code}): ${(error as Error)?.message}`);
        continue;
      }
      if (result.value === 'none') continue;
      const choice = this.guardChoice(plugin, result.value);
      if (first) void choice.onAnswer(choice.defaultOnTimeout);
      else first = { plugin, result: { decision: 'choose', choice } };
    }
    return first;
  }

  async resetBreaker(plugin: string): Promise<void> {
    this.resetBreakers(plugin);
    await this.alerts.clearWhere('breaker-open', { plugin });
  }

  private resetBreakers(plugin: string): void {
    this.runner.reset(plugin);
    this.runner.reset(sessionEndKey(plugin));
    this.runner.reset(startBlockedKey(plugin));
  }

  /** The plugin's answer callback, at most once, with the hook timeout, never rejecting. */
  private guardChoice(plugin: string, choice: PluginChoice): PluginChoice {
    let answered = false;
    const original = choice.onAnswer;
    return {
      ...choice,
      onAnswer: async (choiceId: string) => {
        if (answered) return;
        answered = true;
        await this.runner
          .withTimeout(() => original.call(choice, choiceId))
          .catch((e) => this.logger.warn(`Plugin ${plugin} onAnswer failed: ${(e as Error)?.message ?? e}`));
      },
    };
  }

  private async breakerChanged(plugin: string, transition: BreakerTransition, run: PreStartRun) {
    if (!transition) return;
    if (transition === 'open') {
      await this.alerts
        .raise('breaker-open', `Hooks of plugin ${plugin} keep failing; the host applies the failure policy`, {
          plugin,
        })
        .catch(() => undefined);
    } else {
      await this.alerts.clearWhere('breaker-open', { plugin }).catch(() => undefined);
    }
    await this.audit.record({
      domain: 'attractap',
      action: 'attractap.ui.breaker_changed',
      actor: { id: null, authenticationMethod: null },
      subject: { type: 'resource', id: run.resourceId },
      details: {
        plugin,
        state: transition,
        reasonCode: transition === 'open' ? 'consecutive-failures' : 'recovered',
      },
    });
  }

  /**
   * null = invalid result, which the runner counts as a hook failure. A block with an invalid reason still
   * blocks (the plugin clearly said no, so fail-open must not turn it into an allow), with the host reason.
   */
  private normalize(
    plugin: string,
    raw: PreStartResult,
    run: PreStartRun,
  ): NormalizedOutcome | NeutralResult<NormalizedOutcome> | null {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.decision === 'allow') return { decision: 'allow' };
    if (raw.decision === 'block') {
      const reason = validBlockReason(raw.reason);
      if (reason) return { decision: 'block', plugin, reason };
      const hostBlock = hostReason('HOOK_UNAVAILABLE', run.language);
      return new NeutralResult({ decision: 'block', plugin, reason: hostBlock, auditCode: 'invalid-result' });
    }
    if (raw.decision === 'confirm') {
      const confirmation = validatePluginConfirmation(raw.confirmation);
      if (!confirmation.ok) return null;
      if (run.satisfied.get(plugin)?.has(confirmation.value.stepKey)) return { decision: 'allow' };
      return { decision: 'confirm', plugin, confirmation: confirmation.value };
    }
    return null;
  }

  private async record(
    run: PreStartRun,
    plugin: string,
    action: 'ui.hook_decision' | 'ui.fail_open_used',
    decision: 'allow' | 'confirm' | 'block',
    reasonCode: string,
  ) {
    await this.audit.record({
      domain: 'attractap',
      action: `attractap.${action}` as const,
      actor: { id: null, authenticationMethod: null },
      subject: { type: run.readerId ? 'attractap.reader' : 'resource', id: run.readerId ?? run.resourceId },
      details: {
        plugin,
        userId: run.userId,
        resourceId: run.resourceId,
        decision,
        reasonCode,
        origin: run.origin,
        ...(run.readerId ? { readerId: run.readerId } : {}),
        ...(run.cardSessionId ? { cardSessionId: run.cardSessionId } : {}),
      },
    });
  }
}

function decisionCode(outcome: PreStartOutcome): string {
  return outcome.decision === 'block' ? outcome.reason.code : outcome.decision;
}

function validBlockReason(reason: PluginBlockReason | undefined): PluginBlockReason | null {
  const code =
    typeof reason?.code === 'string' &&
    /^[A-Za-z0-9_.-]{1,40}$/.test(reason.code) &&
    !HOST_RESERVED_BLOCK_CODES.includes(reason.code);
  const title = cleanPluginText(reason?.title, READER_UI_LIMITS.maxTextChars);
  const body = cleanPluginText(reason?.body, READER_UI_LIMITS.maxTextChars * 2);
  if (!code || !title.ok || !body.ok) return null;
  return { code: reason.code, title: title.value, body: body.value };
}

/**
 * null = invalid. Every valid answer, including "not blocked" (`state: null`), counts as a breaker success, so
 * an opened start-blocked breaker closes again once the plugin answers.
 */
function normalizeStartBlocked(
  raw: StartBlockedState | null | undefined,
): { state: { reason: PluginBlockReason; until?: string } | null } | null {
  if (raw === null || raw === undefined) return { state: null };
  if (typeof raw !== 'object') return null;
  const reason = validBlockReason(raw.reason);
  if (!reason) return null;
  const untilMs = raw.until === undefined ? undefined : new Date(raw.until).getTime();
  if (untilMs !== undefined && !Number.isFinite(untilMs)) return null;
  return { state: { reason, ...(untilMs === undefined ? {} : { until: new Date(untilMs).toISOString() }) } };
}

function normalizeSessionEnd(raw: SessionEndResult): PluginChoice | 'none' | null {
  if (raw?.decision === 'none') return 'none';
  if (raw?.decision !== 'choose') return null;
  const choice = validatePluginChoice(raw.choice);
  return choice.ok ? choice.value : null;
}
