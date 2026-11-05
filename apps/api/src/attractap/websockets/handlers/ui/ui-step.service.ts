import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ResourceFormAction } from '@attraccess/database-entities';
import {
  READER_UI_TIMING,
  type PluginChoice,
  type PluginConfirmation,
} from '@attraccess/plugins-backend-sdk';
import { validateStepRequest } from '../../../../resources/forms/reader-ui.validation';
import { AttractapEvent, AttractapEventType, type AuthenticatedWebSocket } from '../../websocket.types';
import { AttractapFormsHandler } from '../forms/forms.handler';
import { CardSessionService } from './card-session.service';
import { UiAuditService } from './ui-audit.service';
import type { CardSessionState, UiStepState } from './ui-socket-state';

export type StepError = 'STEP_UNKNOWN' | 'STEP_EXPIRED';

export interface StartStepBinding {
  resourceId: number;
  action: 'start' | 'takeover';
  projectId?: number;
  userId: number;
}

export interface IssueStartStep extends StartStepBinding {
  plugin: string;
  confirmation: PluginConfirmation;
  requestId: number;
  cardConfirm: boolean;
  satisfied: Record<string, string[]>;
}

function clampTtlSec(requested: number | undefined): number {
  const wanted = Number.isFinite(requested) ? (requested as number) : READER_UI_TIMING.stepDefaultTtlSec;
  return Math.min(Math.max(wanted, 10), READER_UI_TIMING.stepMaxTtlSec);
}

function clampPostStopTtlSec(requested: number | undefined): number {
  const wanted = Number.isFinite(requested) ? (requested as number) : READER_UI_TIMING.postStopDefaultTtlSec;
  return Math.min(Math.max(wanted, 5), READER_UI_TIMING.postStopMaxTtlSec);
}

/**
 * Reader UI steps held in `socket.state` like form drafts. Steps never start anything themselves: a step
 * answer only becomes a satisfied confirmation that the next START (same binding) consumes.
 */
@Injectable()
export class UiStepService {
  private readonly logger = new Logger(UiStepService.name);

  @Inject(AttractapFormsHandler)
  private formsHandler: AttractapFormsHandler;

  constructor(
    private readonly cardSessions: CardSessionService,
    private readonly audit: UiAuditService,
  ) {
    cardSessions.onStarted((socket, session) => this.onCardSessionStarted(socket, session));
    cardSessions.onEnded((socket, session) => this.onCardSessionEnded(socket, session));
  }

  hasOpenStep(socket: AuthenticatedWebSocket): boolean {
    return (socket.state.uiSteps?.size ?? 0) > 0;
  }

  /** Sends UI_STEP_REQUEST for a pre-start confirmation. The START stays unanswered while it is open. */
  issueStart(socket: AuthenticatedWebSocket, spec: IssueStartStep): UiStepState | null {
    const card = this.cardSessions.current(socket);
    if (!card || card.userId !== spec.userId || socket.readerId == null) return null;
    const ttlSec = clampTtlSec(spec.confirmation.expiresInSec);
    const step = this.create(socket, card, {
      kind: spec.cardConfirm ? 'card-confirm' : 'start',
      plugin: spec.plugin,
      stepKey: spec.confirmation.stepKey,
      requestId: spec.requestId,
      resourceId: spec.resourceId,
      action: spec.action,
      projectId: spec.projectId,
      satisfied: spec.satisfied,
      confirmation: spec.confirmation,
      ttlSec,
    });
    const c = spec.confirmation;
    const now = Date.now();
    const sent = this.send(socket, {
      requestId: spec.requestId,
      stepId: step.stepId,
      kind: spec.cardConfirm ? 'card-confirm' : 'confirm',
      resourceId: spec.resourceId,
      serverNowMs: now,
      expiresAtMs: now + ttlSec * 1000,
      title: c.title,
      body: c.body,
      ...(c.tone ? { tone: c.tone } : {}),
      ...(c.countdownTo ? { countdownToMs: new Date(c.countdownTo).getTime() } : {}),
      actions: [
        { id: 'cancel', role: 'cancel', ...(c.cancelLabel ? { label: c.cancelLabel } : {}) },
        { id: 'confirm', role: 'confirm', ...(c.confirmLabel ? { label: c.confirmLabel } : {}) },
      ],
    });
    if (!sent) {
      this.drop(socket, step);
      return null;
    }
    void this.audit.record(
      'ui.step_issued',
      this.details(step, 'confirm', spec.cardConfirm ? 'card-confirm' : 'confirm'),
    );
    return step;
  }

  /** The advisory question after a stop. Only for the holder of the live card session. */
  offerPostStop(
    socket: AuthenticatedWebSocket,
    spec: { plugin: string; choice: PluginChoice; userId: number; resourceId: number },
  ): boolean {
    const card = this.cardSessions.current(socket);
    if (!card || card.userId !== spec.userId || socket.readerId == null) return false;
    const ttlSec = clampPostStopTtlSec(spec.choice.expiresInSec);
    const step = this.create(socket, card, {
      kind: 'post-stop',
      plugin: spec.plugin,
      stepKey: spec.choice.stepKey,
      requestId: 0,
      resourceId: spec.resourceId,
      action: 'start',
      satisfied: {},
      choice: spec.choice,
      ttlSec,
    });
    const now = Date.now();
    // `send` validates and sanitizes title, body and labels; an invalid question is dropped.
    const sent = this.send(socket, {
      requestId: 0,
      stepId: step.stepId,
      kind: 'choose',
      resourceId: spec.resourceId,
      serverNowMs: now,
      expiresAtMs: now + ttlSec * 1000,
      title: spec.choice.title,
      body: spec.choice.body,
      choices: spec.choice.choices.map((c) => ({ id: c.id, label: c.label })),
    });
    if (!sent) {
      this.drop(socket, step);
      return false;
    }
    void this.audit.record('ui.step_issued', this.details(step, 'confirm', 'post-stop'));
    return true;
  }

  /** Uses up the step with this start attempt, whatever the outcome. */
  consumeStart(
    socket: AuthenticatedWebSocket,
    stepId: unknown,
    binding: StartStepBinding,
  ): { ok: true; satisfied: Record<string, string[]> } | { ok: false; error: StepError } {
    const step = typeof stepId === 'string' ? socket.state.uiSteps?.get(stepId) : undefined;
    if (!step || step.kind === 'post-stop') return { ok: false, error: 'STEP_UNKNOWN' };
    this.drop(socket, step);
    if (Date.now() > step.deadline) {
      void this.audit.record('ui.step_expired', this.details(step, 'expired', 'expired'));
      return { ok: false, error: 'STEP_EXPIRED' };
    }
    const card = this.cardSessions.current(socket);
    const cardOk =
      !!card &&
      (step.kind === 'card-confirm'
        ? card.userId === step.userId && card.issuedAt > step.issuedAt && card.id !== step.cardSessionId
        : card.id === step.cardSessionId && card.userId === step.userId);
    const bound =
      step.readerId === socket.readerId &&
      step.resourceId === binding.resourceId &&
      step.action === binding.action &&
      step.projectId === binding.projectId &&
      step.userId === binding.userId;
    if (!cardOk || !bound) return { ok: false, error: 'STEP_UNKNOWN' };
    void this.audit.record('ui.step_answered', this.details(step, 'answered', 'confirmed'));
    return {
      ok: true,
      satisfied: { ...step.satisfied, [step.plugin]: [...(step.satisfied[step.plugin] ?? []), step.stepKey] },
    };
  }

  /** UI_STEP_RESULT. Can cancel a pre-start step or answer a post-stop question; it never starts a session. */
  handleResult(socket: AuthenticatedWebSocket, payload: { stepId?: unknown; action?: unknown }): void {
    const step = typeof payload?.stepId === 'string' ? socket.state.uiSteps?.get(payload.stepId) : undefined;
    if (!step || step.readerId !== socket.readerId || typeof payload.action !== 'string') return;
    if (step.kind === 'post-stop') {
      const card = this.cardSessions.current(socket);
      if (!card || card.id !== step.cardSessionId) return;
      this.drop(socket, step);
      const valid = step.choice?.choices.some((c) => c.id === payload.action);
      void this.audit.record('ui.step_answered', this.details(step, valid ? 'answered' : 'default', 'post-stop'));
      this.applyChoice(step, valid ? (payload.action as string) : (step.choice?.defaultOnTimeout ?? ''));
      return;
    }
    if (payload.action === 'cancel') this.cancel(socket, step, 'cancelled', false);
  }

  /** Close cleanup: pending steps are discarded, post-stop questions fall back to their default. */
  discardAll(socket: AuthenticatedWebSocket): void {
    for (const step of [...(socket.state.uiSteps?.values() ?? [])]) this.cancel(socket, step, 'cancelled', false);
  }

  /** Server-side cancellation, e.g. the situation changed. */
  cancel(
    socket: AuthenticatedWebSocket,
    step: UiStepState,
    why: 'cancelled' | 'expired',
    notifyReader: boolean,
    reasonCode: string = why,
  ): void {
    if (!socket.state.uiSteps?.has(step.stepId)) return;
    this.drop(socket, step);
    if (step.kind !== 'post-stop') {
      this.formsHandler.clearFormDraft(
        socket,
        step.resourceId,
        step.action === 'takeover' ? ResourceFormAction.TAKEOVER : ResourceFormAction.START,
      );
    } else {
      this.applyChoice(step, step.choice?.defaultOnTimeout ?? '');
    }
    void this.audit.record(
      why === 'expired' ? 'ui.step_expired' : 'ui.step_cancelled',
      this.details(step, why, reasonCode),
    );
    if (notifyReader) {
      void socket
        .sendMessage(new AttractapEvent(AttractapEventType.UI_STEP_CANCEL, { stepId: step.stepId }))
        .catch(() => undefined);
    }
  }

  private onCardSessionStarted(socket: AuthenticatedWebSocket, session: CardSessionState): void {
    for (const step of [...(socket.state.uiSteps?.values() ?? [])]) {
      if (step.cardSessionId === session.id) continue;
      if (step.kind === 'card-confirm' && step.userId === session.userId) continue;
      if (step.kind === 'card-confirm') {
        void this.audit.record('ui.card_confirm_cancelled', {
          ...this.details(step, 'cancelled', 'other-user'),
          tappedUserId: session.userId,
        });
      }
      this.cancel(socket, step, 'cancelled', true, 'card-session-replaced');
    }
  }

  private onCardSessionEnded(socket: AuthenticatedWebSocket, session: CardSessionState): void {
    for (const step of [...(socket.state.uiSteps?.values() ?? [])]) {
      if (step.cardSessionId === session.id && step.kind !== 'card-confirm') {
        this.cancel(socket, step, 'cancelled', true, 'card-session-ended');
      }
    }
  }

  private create(
    socket: AuthenticatedWebSocket,
    card: CardSessionState,
    spec: Pick<UiStepState, 'kind' | 'plugin' | 'stepKey' | 'requestId' | 'resourceId' | 'action' | 'satisfied'> &
      Partial<Pick<UiStepState, 'projectId' | 'confirmation' | 'choice'>> & { ttlSec: number },
  ): UiStepState {
    // At most one open step per reader: a newer one replaces the older.
    for (const open of [...(socket.state.uiSteps?.values() ?? [])])
      this.cancel(socket, open, 'cancelled', true, 'replaced');
    const now = Date.now();
    const { ttlSec, ...rest } = spec;
    const step: UiStepState = {
      ...rest,
      stepId: randomBytes(16).toString('base64url'),
      readerId: socket.readerId as number,
      cardSessionId: card.id,
      userId: card.userId,
      issuedAt: now,
      deadline: now + ttlSec * 1000 + READER_UI_TIMING.stepGraceSec * 1000,
      timer: null,
    };
    // A post-stop question is closed on the reader too, in case its own expiry tick does not run.
    step.timer = setTimeout(
      () => this.cancel(socket, step, 'expired', step.kind === 'post-stop'),
      step.deadline - now,
    );
    step.timer.unref?.();
    (socket.state.uiSteps ??= new Map()).set(step.stepId, step);
    return step;
  }

  private drop(socket: AuthenticatedWebSocket, step: UiStepState): void {
    if (step.timer) clearTimeout(step.timer);
    step.timer = null;
    socket.state.uiSteps?.delete(step.stepId);
    this.cardSessions.rearm(socket);
  }

  /** `onAnswer` comes host-guarded from the hook runner (timeout, at most once); this is a second net. */
  private applyChoice(step: UiStepState, choiceId: string): void {
    if (!step.choice) return;
    Promise.resolve()
      .then(() => step.choice?.onAnswer(choiceId))
      .catch((error) => this.logger.warn(`Plugin ${step.plugin} onAnswer failed: ${(error as Error)?.message}`));
  }

  private send(socket: AuthenticatedWebSocket, payload: Record<string, unknown>): boolean {
    const validated = validateStepRequest(payload);
    if ('reason' in validated) {
      this.logger.warn(`Dropping invalid step (${validated.reason})`);
      return false;
    }
    void socket
      .sendMessage(new AttractapEvent(AttractapEventType.UI_STEP_REQUEST, validated.value))
      .catch(() => undefined);
    return true;
  }

  private details(
    step: UiStepState,
    decision: 'confirm' | 'answered' | 'cancelled' | 'expired' | 'default',
    reasonCode: string,
  ) {
    return {
      plugin: step.plugin,
      readerId: step.readerId,
      userId: step.userId,
      resourceId: step.resourceId,
      decision,
      reasonCode,
      cardSessionId: step.cardSessionId,
      origin: 'reader' as const,
    };
  }
}
