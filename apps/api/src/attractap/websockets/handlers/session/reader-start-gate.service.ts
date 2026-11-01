import { Injectable } from '@nestjs/common';
import { type User } from '@attraccess/database-entities';
import { PreStartService } from '../../../../resources/usage/pre-start/pre-start.service';
import { SessionEndNotifier } from '../../../../resources/usage/pre-start/session-end-notifier.service';
import { ReaderUiAlertsService } from '../../../../plugin-system/reader-ui/reader-ui-alerts.service';
import { ReaderUiSettingsService } from '../../../../plugin-system/reader-ui/reader-ui-settings.service';
import { AttractapService } from '../../../attractap.service';
import { type AuthenticatedWebSocket } from '../../websocket.types';
import { CardSessionService } from '../ui/card-session.service';
import { UiAuditService } from '../ui/ui-audit.service';
import { UiStepService } from '../ui/ui-step.service';

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

  async run(socket: AuthenticatedWebSocket, input: StartGateInput): Promise<StartGateResult> {
    const action = input.forceTakeOver ? 'takeover' : 'start';
    let satisfied: Record<string, string[]> = {};
    if (input.stepId !== undefined) {
      const used = this.steps.consumeStart(socket, input.stepId, {
        resourceId: input.resourceId,
        action,
        projectId: input.projectId,
        userId: input.user.id,
      });
      if ('error' in used) return { kind: 'reply', payload: { error: used.error } };
      satisfied = used.satisfied;
    }
    if (!this.preStart.hasHooks()) return { kind: 'proceed' };

    const card = this.cardSessions.current(socket);
    const outcome = await this.preStart.evaluate({
      resourceId: input.resourceId,
      user: input.user,
      forceTakeOver: input.forceTakeOver,
      projectId: input.projectId,
      origin: 'reader',
      supervisorUserId: input.supervisorUserId ?? null,
      readerId: socket.readerId ?? undefined,
      cardSessionId: card?.id,
      satisfied,
    });
    if (outcome.decision === 'allow') return { kind: 'proceed' };
    if (outcome.decision === 'block') {
      return { kind: 'reply', payload: { error: 'START_BLOCKED', reason: outcome.reason } };
    }

    const confirmation = outcome.confirmation;
    const caps = await this.capabilities(socket);
    const usable = !!caps && caps.schemaVersion >= 1 && !this.alerts.isReaderSuspended(socket.readerId as number);
    const spec = {
      resourceId: input.resourceId,
      action,
      projectId: input.projectId,
      userId: input.user.id,
      plugin: outcome.plugin,
      confirmation,
      requestId: Number.isSafeInteger(input.requestId) ? (input.requestId as number) : 0,
      satisfied,
    } as const;
    if (usable && caps.steps.includes('confirm')) {
      if (this.steps.issueStart(socket, { ...spec, cardConfirm: false })) return { kind: 'held' };
    }

    // No screen (Lite, old firmware, suspended reader): the per-resource override or the plugin default decides.
    const policy =
      (await this.settings.noScreenPolicyOverride(input.resourceId)) ?? confirmation.noScreenPolicy ?? 'block';
    void this.audit.record('ui.no_screen_policy_applied', {
      plugin: outcome.plugin,
      readerId: socket.readerId as number,
      userId: input.user.id,
      resourceId: input.resourceId,
      decision: 'confirm',
      reasonCode: usable ? 'no-screen' : 'no-ui',
      cardSessionId: card?.id,
      policy,
    });
    if (policy === 'allow-with-warning') return { kind: 'proceed', warning: true };
    if (policy === 'card-confirm' && usable && caps.steps.includes('card-confirm')) {
      if (this.steps.issueStart(socket, { ...spec, cardConfirm: true })) return { kind: 'held' };
    }
    return {
      kind: 'reply',
      payload: {
        error: 'START_BLOCKED',
        reason: { code: 'CONFIRMATION_REQUIRED', title: confirmation.title, body: confirmation.body },
      },
    };
  }

  /** After the stop reply: the advisory question for the holder, else the plugin's default. Never throws. */
  async afterStop(
    socket: AuthenticatedWebSocket,
    info: { resourceId: number; userId: number; sessionId: number },
  ): Promise<void> {
    const asked = await this.sessionEnd.ask(info);
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
    if (!shown)
      await Promise.resolve(asked.result.choice.onAnswer(asked.result.choice.defaultOnTimeout)).catch(() => undefined);
  }

  private async capabilities(socket: AuthenticatedWebSocket) {
    const reader = await this.attractapService.findReaderById(socket.readerId as number);
    const ui = reader?.firmware?.capabilities?.ui as { schemaVersion: number; steps: string[] } | null | undefined;
    return ui ?? null;
  }
}
