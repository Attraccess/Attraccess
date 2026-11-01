import { Injectable } from '@nestjs/common';
import { type User } from '@attraccess/database-entities';
import type { PluginBlockReason, PluginConfirmation } from '@attraccess/plugins-backend-sdk';
import { hostReason } from '../../../../plugin-system/reader-ui/host-texts';
import { PreStartService } from '../../../../resources/usage/pre-start/pre-start.service';
import { SessionEndNotifier } from '../../../../resources/usage/pre-start/session-end-notifier.service';
import { ReaderUiAlertsService } from '../../../../plugin-system/reader-ui/reader-ui-alerts.service';
import { ReaderUiSettingsService } from '../../../../plugin-system/reader-ui/reader-ui-settings.service';
import { AttractapService } from '../../../attractap.service';
import { type AuthenticatedWebSocket } from '../../websocket.types';
import { CardSessionService } from '../ui/card-session.service';
import { UiAuditService } from '../ui/ui-audit.service';
import { UiStepService } from '../ui/ui-step.service';
import type { CardSessionState } from '../ui/ui-socket-state';

export type StartGateResult =
  | { kind: 'proceed'; warning?: boolean }
  /** Reply to the START with this payload (the session does not start). */
  | { kind: 'reply'; payload: Record<string, unknown> }
  /** A step is open: the START stays unanswered until it is answered, cancelled or expires. */
  | { kind: 'held' };

export interface StartGateInput {
  user: User;
  resourceId: number;
  projectId?: number;
  forceTakeOver?: boolean;
  requestId?: number;
  stepId?: unknown;
  supervisorUserId?: number;
}

/**
 * Reader side of the pre-start hook contract: allow / confirm (step on screens, no-screen policy elsewhere) /
 * block. Lives next to the session handler because it needs the usage service through PreStartService; the
 * `handlers/ui/*` group must not reach it.
 */
@Injectable()
export class ReaderStartGate {
  constructor(
    private readonly preStart: PreStartService,
    private readonly sessionEnd: SessionEndNotifier,
    private readonly steps: UiStepService,
    private readonly cardSessions: CardSessionService,
    private readonly settings: ReaderUiSettingsService,
    private readonly alerts: ReaderUiAlertsService,
    private readonly attractapService: AttractapService,
    private readonly audit: UiAuditService,
  ) {}

  /** Precheck refusals are thrown, like the same refusal from `startSession`. */
  async run(socket: AuthenticatedWebSocket, input: StartGateInput): Promise<StartGateResult> {
    const action = input.forceTakeOver ? 'takeover' : 'start';
    const card = this.cardSessions.current(socket);
    let satisfied: Record<string, string[]> = {};
    if (input.stepId !== undefined) {
      const used = this.steps.consumeStart(socket, input.stepId, {
        resourceId: input.resourceId,
        action,
        projectId: input.projectId,
        userId: input.user.id,
      });
      if ('error' in used) return blocked(hostReason(used.error, card?.language));
      satisfied = used.satisfied;
    }
    if (!this.preStart.hasHooks()) return { kind: 'proceed' };

    const outcome = await this.preStart.evaluate({
      resourceId: input.resourceId,
      user: input.user,
      forceTakeOver: input.forceTakeOver,
      projectId: input.projectId,
      origin: 'reader',
      supervisorUserId: input.supervisorUserId ?? null,
      readerId: socket.readerId ?? undefined,
      cardSessionId: card?.id,
      language: card?.language,
      satisfied,
    });
    if (outcome.decision === 'allow') return { kind: 'proceed' };
    if (outcome.decision === 'block') return blocked(outcome.reason);
    return this.confirm(socket, input, { ...outcome, action, satisfied, card });
  }

  private async confirm(
    socket: AuthenticatedWebSocket,
    input: StartGateInput,
    ctx: {
      plugin: string;
      confirmation: PluginConfirmation;
      action: 'start' | 'takeover';
      satisfied: Record<string, string[]>;
      card: CardSessionState | null;
    },
  ): Promise<StartGateResult> {
    const { confirmation, card } = ctx;
    const caps = await this.capabilities(socket);
    const usable = !!caps && caps.schemaVersion >= 1 && !this.alerts.isReaderSuspended(socket.readerId as number);
    const spec = {
      resourceId: input.resourceId,
      action: ctx.action,
      projectId: input.projectId,
      userId: input.user.id,
      plugin: ctx.plugin,
      confirmation,
      requestId: Number.isSafeInteger(input.requestId) ? (input.requestId as number) : 0,
      satisfied: ctx.satisfied,
    } as const;
    const audit = {
      plugin: ctx.plugin,
      readerId: socket.readerId as number,
      userId: input.user.id,
      resourceId: input.resourceId,
      cardSessionId: card?.id,
      origin: 'reader' as const,
    };
    if (usable && caps.steps.includes('confirm')) {
      if (this.steps.issueStart(socket, { ...spec, cardConfirm: false })) return { kind: 'held' };
      // A screen reader never falls back to the no-screen policy: no confirmation, no start.
      void this.audit.record('ui.hook_decision', {
        ...audit,
        decision: 'block',
        reasonCode: 'CONFIRMATION_UNAVAILABLE',
      });
      return blocked(hostReason('CONFIRMATION_UNAVAILABLE', card?.language));
    }

    // No screen (Lite, old firmware, suspended reader): the per-resource override or the plugin default decides.
    const policy =
      (await this.settings.noScreenPolicyOverride(input.resourceId)) ?? confirmation.noScreenPolicy ?? 'block';
    void this.audit.record('ui.no_screen_policy_applied', {
      ...audit,
      decision: 'confirm',
      reasonCode: usable ? 'no-screen' : 'no-ui',
      policy,
    });
    if (policy === 'allow-with-warning') return { kind: 'proceed', warning: true };
    if (policy === 'card-confirm' && usable && caps.steps.includes('card-confirm')) {
      if (this.steps.issueStart(socket, { ...spec, cardConfirm: true })) return { kind: 'held' };
    }
    return blocked({ code: 'CONFIRMATION_REQUIRED', title: confirmation.title, body: confirmation.body });
  }

  /** After the stop reply: the advisory question for the holder, else the plugin's default. Never throws. */
  async afterStop(
    socket: AuthenticatedWebSocket,
    info: { resourceId: number; userId: number; sessionId: number },
  ): Promise<void> {
    const card = this.cardSessions.current(socket);
    const asked = await this.sessionEnd.ask(info, card?.language ?? 'en');
    if (!asked) return;
    const caps = await this.capabilities(socket).catch(() => null);
    const canAsk = !!caps && caps.schemaVersion >= 1 && caps.steps.includes('choose');
    const shown =
      canAsk &&
      this.steps.offerPostStop(socket, {
        plugin: asked.plugin,
        choice: asked.result.choice,
        userId: info.userId,
        resourceId: info.resourceId,
      });
    // `onAnswer` is host-guarded (timeout, never rejects); the catch is a second net.
    if (!shown)
      await Promise.resolve()
        .then(() => asked.result.choice.onAnswer(asked.result.choice.defaultOnTimeout))
        .catch(() => undefined);
  }

  /** Validated on READER_FIRMWARE_INFO; the stored firmware info only before that message arrived. */
  private async capabilities(socket: AuthenticatedWebSocket): Promise<{ schemaVersion: number; steps: string[] } | null> {
    if (socket.state.uiSlots) return socket.state.uiSlots.capabilities;
    const reader = await this.attractapService.findReaderById(socket.readerId as number);
    const ui = reader?.firmware?.capabilities?.ui as { schemaVersion: number; steps: string[] } | null | undefined;
    return ui ?? null;
  }
}

function blocked(reason: PluginBlockReason): StartGateResult {
  return { kind: 'reply', payload: { error: 'START_BLOCKED', reason } };
}
