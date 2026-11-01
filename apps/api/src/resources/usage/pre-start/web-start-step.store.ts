import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { READER_UI_TIMING } from '@attraccess/plugins-backend-sdk';
import { AuditService } from '../../../audit/audit.service';

export interface WebStepBinding {
  userId: number;
  apiTokenId?: number;
  resourceId: number;
  action: 'start' | 'takeover';
  projectId?: number;
  origin: 'web' | 'api';
}

interface WebStep extends WebStepBinding {
  plugin: string;
  stepKey: string;
  expiresAt: number;
  satisfied: Record<string, string[]>;
}

/** Open confirmations per principal (user + API token), that principal's oldest dropped first. */
export const MAX_OPEN_WEB_STEPS_PER_PRINCIPAL = 20;

/** Last-resort cap on all open web/API confirmations, oldest dropped first. */
export const MAX_OPEN_WEB_STEPS = 1000;

const samePrincipal = (a: WebStepBinding, b: WebStepBinding) => a.userId === b.userId && a.apiTokenId === b.apiTokenId;

const sameBinding = (a: WebStepBinding, b: WebStepBinding) =>
  a.userId === b.userId &&
  a.apiTokenId === b.apiTokenId &&
  a.resourceId === b.resourceId &&
  a.action === b.action &&
  a.projectId === b.projectId &&
  a.origin === b.origin;

/**
 * Server-side confirmations for web and API starts. Ids are random, single-use, short-lived and bound to the
 * principal, resource, action, project and origin. Plugins never see them, only their own step keys. At most
 * one confirmation per binding is open: a newer one replaces the older.
 */
@Injectable()
export class WebStartStepStore {
  private readonly steps = new Map<string, WebStep>();

  constructor(private readonly audit: AuditService) {}

  get size(): number {
    return this.steps.size;
  }

  issue(binding: WebStepBinding, plugin: string, stepKey: string, ttlSec: number, satisfied: Record<string, string[]>) {
    this.sweep(binding);
    this.capPrincipal(binding);
    const ttl = Math.min(Math.max(Number.isFinite(ttlSec) ? ttlSec : 60, 10), READER_UI_TIMING.stepMaxTtlSec);
    const stepId = randomBytes(16).toString('base64url');
    const expiresAtMs = Date.now() + ttl * 1000;
    const step: WebStep = {
      ...binding,
      plugin,
      stepKey,
      satisfied,
      expiresAt: expiresAtMs + READER_UI_TIMING.stepGraceSec * 1000,
    };
    this.steps.set(stepId, step);
    while (this.steps.size > MAX_OPEN_WEB_STEPS) this.steps.delete(this.steps.keys().next().value as string);
    this.record('ui.step_issued', step, 'confirm', 'confirm');
    return { stepId, expiresAtMs };
  }

  /** Uses every id up, whatever the outcome, and returns the accumulated satisfied step keys. */
  consume(ids: string[] | undefined, binding: WebStepBinding): Record<string, string[]> {
    const satisfied: Record<string, string[]> = {};
    for (const id of ids ?? []) {
      const step = this.steps.get(id);
      this.steps.delete(id);
      if (!step || !sameBinding(step, binding))
        throw new BadRequestException({ code: 'STEP_UNKNOWN', message: 'Unknown confirmation' });
      if (Date.now() > step.expiresAt) {
        this.record('ui.step_expired', step, 'expired', 'expired');
        throw new BadRequestException({ code: 'STEP_EXPIRED', message: 'The confirmation expired' });
      }
      this.record('ui.step_answered', step, 'answered', 'confirmed');
      for (const [plugin, keys] of Object.entries({
        ...step.satisfied,
        [step.plugin]: [...(step.satisfied[step.plugin] ?? []), step.stepKey],
      })) {
        satisfied[plugin] = [...new Set([...(satisfied[plugin] ?? []), ...keys])];
      }
    }
    return satisfied;
  }

  /** Makes room for one more step of this principal, so one user cannot push out everybody else's steps. */
  private capPrincipal(binding: WebStepBinding): void {
    const own = [...this.steps].filter(([, step]) => samePrincipal(step, binding));
    for (const [id, step] of own.slice(0, Math.max(own.length - MAX_OPEN_WEB_STEPS_PER_PRINCIPAL + 1, 0))) {
      this.steps.delete(id);
      this.record('ui.step_cancelled', step, 'cancelled', 'evicted');
    }
  }

  /** Drops expired steps and the open step of the same binding. */
  private sweep(binding: WebStepBinding): void {
    const now = Date.now();
    for (const [id, step] of this.steps) {
      if (now > step.expiresAt) {
        this.steps.delete(id);
        this.record('ui.step_expired', step, 'expired', 'expired');
      } else if (sameBinding(step, binding)) {
        this.steps.delete(id);
        this.record('ui.step_cancelled', step, 'cancelled', 'replaced');
      }
    }
  }

  private record(
    action: 'ui.step_issued' | 'ui.step_answered' | 'ui.step_expired' | 'ui.step_cancelled',
    step: WebStep,
    decision: 'confirm' | 'answered' | 'expired' | 'cancelled',
    reasonCode: string,
  ): void {
    const viaToken = step.apiTokenId !== undefined;
    void this.audit
      .recordAttractap({
        action,
        subjectType: 'resource',
        actorId: step.userId,
        authenticationMethod: viaToken ? 'api-token' : 'session',
        ...(viaToken ? { apiTokenId: step.apiTokenId } : {}),
        subjectId: step.resourceId,
        details: {
          plugin: step.plugin,
          userId: step.userId,
          resourceId: step.resourceId,
          decision,
          reasonCode,
          origin: step.origin,
        },
      })
      .catch(() => undefined);
  }
}
