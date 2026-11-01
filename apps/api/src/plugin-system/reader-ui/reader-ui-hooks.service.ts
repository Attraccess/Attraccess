import { Injectable, Logger } from '@nestjs/common';
import {
  READER_UI_LIMITS,
  READER_UI_TIMING,
  type PluginBlockReason,
  type PluginConfirmation,
  type PreStartOrigin,
  type PreStartResult,
  type SessionEndResult,
} from '@attraccess/plugins-backend-sdk';
import { AuditService } from '../../audit/audit.service';
import { cleanPluginLabel, cleanPluginText } from '../../resources/forms/reader-ui.validation';
import { CircuitBreaker } from './circuit-breaker';
import { ReaderUiAlertsService } from './reader-ui-alerts.service';
import { ReaderUiSettingsService } from './reader-ui-settings.service';
import { ReaderUiRegistry } from './reader-ui.registry';

export interface PreStartRun {
  resourceId: number;
  userId: number;
  action: 'start' | 'takeover';
  projectId?: number;
  origin: PreStartOrigin;
  readerId?: number;
  cardSessionId?: string;
  /** plugin -> stepKeys confirmed in this start attempt. */
  satisfied: Map<string, Set<string>>;
}

export type PreStartOutcome =
  | { decision: 'allow' }
  | { decision: 'block'; plugin: string; reason: PluginBlockReason }
  | { decision: 'confirm'; plugin: string; confirmation: PluginConfirmation };

export const HOOK_UNAVAILABLE: PluginBlockReason = {
  code: 'HOOK_UNAVAILABLE',
  title: 'Temporarily unavailable',
  body: 'This resource cannot be started right now. Please try again later.',
};

class HookFailure extends Error {
  constructor(public readonly code: 'timeout' | 'exception' | 'invalid-result') {
    super(code);
  }
}

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Runs plugin hooks with timeout, circuit breaker, failure policy and host audit. */
@Injectable()
export class ReaderUiHooksService {
  private readonly logger = new Logger(ReaderUiHooksService.name);
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(
    private readonly registry: ReaderUiRegistry,
    private readonly settings: ReaderUiSettingsService,
    private readonly alerts: ReaderUiAlertsService,
    private readonly audit: AuditService,
  ) {
    this.alerts.onCleared((alert) => {
      if (alert.kind === 'breaker-open' && alert.plugin) this.breakers.get(alert.plugin)?.reset();
    });
  }

  hasPreStartHooks(): boolean {
    return this.registry.preStartHooks().length > 0;
  }

  get timeoutMs(): number {
    return Math.min(
      envInt('READER_UI_HOOK_TIMEOUT_MS', READER_UI_TIMING.hookDefaultTimeoutMs),
      READER_UI_TIMING.hookMaxTimeoutMs,
    );
  }

  async runPreStart(run: PreStartRun): Promise<PreStartOutcome> {
    let firstConfirm: PreStartOutcome | null = null;
    for (const { plugin, hook } of this.registry.preStartHooks()) {
      const confirmedStepKeys = [...(run.satisfied.get(plugin) ?? [])];
      const result = await this.guarded(plugin, run, () =>
        hook({
          resourceId: run.resourceId,
          userId: run.userId,
          action: run.action,
          projectId: run.projectId,
          origin: run.origin,
          confirmedStepKeys,
          now: new Date(),
        }),
      );
      if (result.kind === 'failure') {
        const policy = await this.settings.failurePolicy(run.resourceId, plugin);
        if (policy === 'fail-open') {
          await this.record(run, plugin, 'ui.fail_open_used', 'allow', result.code);
          continue;
        }
        await this.record(run, plugin, 'ui.hook_decision', 'block', result.code);
        return { decision: 'block', plugin, reason: HOOK_UNAVAILABLE };
      }
      const outcome = this.normalize(plugin, result.value, run);
      if (outcome === null) {
        await this.record(run, plugin, 'ui.hook_decision', 'block', 'invalid-result');
        return { decision: 'block', plugin, reason: HOOK_UNAVAILABLE };
      }
      await this.record(
        run,
        plugin,
        'ui.hook_decision',
        outcome.decision,
        outcome.decision === 'block' ? outcome.reason.code : outcome.decision === 'confirm' ? 'confirm' : 'allow',
      );
      if (outcome.decision === 'block') return outcome;
      if (outcome.decision === 'confirm') firstConfirm ??= outcome;
    }
    return firstConfirm ?? { decision: 'allow' };
  }

  /** Advisory only: failures and invalid results simply mean "no question". */
  async runSessionEnd(ctx: {
    resourceId: number;
    userId: number;
    sessionId: number;
    origin: 'web' | 'api' | 'reader';
  }): Promise<{ plugin: string; result: Extract<SessionEndResult, { decision: 'choose' }> } | null> {
    for (const { plugin, hook } of this.registry.sessionEndHooks()) {
      const run: PreStartRun = { ...ctx, action: 'start', satisfied: new Map() };
      const result = await this.guarded(plugin, run, () => hook({ ...ctx, now: new Date() }));
      if (result.kind === 'failure' || result.value?.decision !== 'choose') continue;
      const choice = result.value.choice;
      const valid =
        choice &&
        Array.isArray(choice.choices) &&
        choice.choices.length > 0 &&
        choice.choices.length <= READER_UI_LIMITS.maxChoices &&
        choice.choices.some((c) => c.id === choice.defaultOnTimeout);
      if (valid) return { plugin, result: result.value };
    }
    return null;
  }

  async resetBreaker(plugin: string): Promise<void> {
    this.breakers.get(plugin)?.reset();
    await this.alerts.clearWhere('breaker-open', { plugin });
  }

  private breaker(plugin: string): CircuitBreaker {
    let breaker = this.breakers.get(plugin);
    if (!breaker) {
      breaker = new CircuitBreaker(
        envInt('READER_UI_BREAKER_THRESHOLD', READER_UI_TIMING.breakerThreshold),
        READER_UI_TIMING.breakerProbeAfterMs,
      );
      this.breakers.set(plugin, breaker);
    }
    return breaker;
  }

  private async guarded<T>(
    plugin: string,
    run: PreStartRun,
    call: () => T | Promise<T>,
  ): Promise<{ kind: 'ok'; value: T } | { kind: 'failure'; code: 'timeout' | 'exception' | 'breaker-open' }> {
    const breaker = this.breaker(plugin);
    if (breaker.next(Date.now()) === 'open') return { kind: 'failure', code: 'breaker-open' };
    try {
      const value = await this.withTimeout(call);
      if (breaker.success()) await this.breakerChanged(plugin, 'closed', run);
      return { kind: 'ok', value };
    } catch (error) {
      const code = error instanceof HookFailure ? error.code : 'exception';
      this.logger.warn(`Hook of plugin ${plugin} failed (${code}): ${(error as Error)?.message}`);
      if (breaker.failure(Date.now())) await this.breakerChanged(plugin, 'open', run);
      return { kind: 'failure', code: code === 'timeout' ? 'timeout' : 'exception' };
    }
  }

  private withTimeout<T>(call: () => T | Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new HookFailure('timeout')), this.timeoutMs);
      Promise.resolve()
        .then(call)
        .then(resolve, reject)
        .finally(() => clearTimeout(timer));
    });
  }

  private async breakerChanged(plugin: string, state: 'open' | 'closed', run: PreStartRun) {
    if (state === 'open') {
      await this.alerts
        .raise('breaker-open', `Hooks of plugin ${plugin} keep failing; the host applies the failure policy`, {
          plugin,
        })
        .catch(() => undefined);
    } else {
      await this.alerts.clearWhere('breaker-open', { plugin }).catch(() => undefined);
    }
    await this.audit
      .recordAttractap({
        action: 'ui.breaker_changed',
        subjectType: 'resource',
        actorId: null,
        authenticationMethod: null,
        subjectId: run.resourceId,
        details: { plugin, state, reasonCode: state === 'open' ? 'consecutive-failures' : 'recovered' },
      })
      .catch(() => undefined);
  }

  private normalize(plugin: string, raw: PreStartResult, run: PreStartRun): PreStartOutcome | null {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.decision === 'allow') return { decision: 'allow' };
    if (raw.decision === 'block') {
      const code = typeof raw.reason?.code === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(raw.reason.code);
      const title = cleanPluginText(raw.reason?.title, READER_UI_LIMITS.maxTextChars);
      const body = cleanPluginText(raw.reason?.body, READER_UI_LIMITS.maxTextChars * 2);
      if (!code || !title.ok || !body.ok) return null;
      return { decision: 'block', plugin, reason: { code: raw.reason.code, title: title.value, body: body.value } };
    }
    if (raw.decision === 'confirm') {
      const c = raw.confirmation;
      const title = cleanPluginText(c?.title, READER_UI_LIMITS.maxTextChars);
      const body = cleanPluginText(c?.body, READER_UI_LIMITS.maxTextChars * 2);
      if (!c || !READER_UI_LIMITS.idPattern.test(String(c.stepKey)) || !title.ok || !body.ok) return null;
      if (run.satisfied.get(plugin)?.has(c.stepKey)) return { decision: 'allow' };
      const confirmLabel = c.confirmLabel === undefined ? undefined : cleanPluginLabel(c.confirmLabel);
      const cancelLabel = c.cancelLabel === undefined ? undefined : cleanPluginLabel(c.cancelLabel);
      if ((confirmLabel && !confirmLabel.ok) || (cancelLabel && !cancelLabel.ok)) return null;
      return {
        decision: 'confirm',
        plugin,
        confirmation: {
          ...c,
          title: title.value,
          body: body.value,
          ...(confirmLabel?.ok ? { confirmLabel: confirmLabel.value } : {}),
          ...(cancelLabel?.ok ? { cancelLabel: cancelLabel.value } : {}),
        },
      };
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
    await this.audit
      .recordAttractap({
        action,
        subjectType: run.readerId ? 'attractap.reader' : 'resource',
        actorId: null,
        authenticationMethod: null,
        subjectId: run.readerId ?? run.resourceId,
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
      })
      .catch(() => undefined);
  }
}
