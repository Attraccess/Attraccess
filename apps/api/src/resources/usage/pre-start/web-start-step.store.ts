import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { READER_UI_TIMING } from '@attraccess/plugins-backend-sdk';

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

const sameBinding = (a: WebStepBinding, b: WebStepBinding) =>
  a.userId === b.userId &&
  a.apiTokenId === b.apiTokenId &&
  a.resourceId === b.resourceId &&
  a.action === b.action &&
  a.projectId === b.projectId &&
  a.origin === b.origin;

/**
 * Server-side confirmations for web and API starts. Ids are random, single-use, short-lived and bound to the
 * principal, resource, action, project and origin. Plugins never see them, only their own step keys.
 */
@Injectable()
export class WebStartStepStore {
  private readonly steps = new Map<string, WebStep>();

  issue(binding: WebStepBinding, plugin: string, stepKey: string, ttlSec: number, satisfied: Record<string, string[]>) {
    this.sweep();
    const ttl = Math.min(Math.max(ttlSec, 10), READER_UI_TIMING.stepMaxTtlSec);
    const stepId = randomBytes(16).toString('base64url');
    const expiresAtMs = Date.now() + ttl * 1000;
    this.steps.set(stepId, {
      ...binding,
      plugin,
      stepKey,
      satisfied,
      expiresAt: expiresAtMs + READER_UI_TIMING.stepGraceSec * 1000,
    });
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
      if (Date.now() > step.expiresAt)
        throw new BadRequestException({ code: 'STEP_EXPIRED', message: 'The confirmation expired' });
      for (const [plugin, keys] of Object.entries({
        ...step.satisfied,
        [step.plugin]: [...(step.satisfied[step.plugin] ?? []), step.stepKey],
      })) {
        satisfied[plugin] = [...new Set([...(satisfied[plugin] ?? []), ...keys])];
      }
    }
    return satisfied;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, step] of this.steps) if (now > step.expiresAt) this.steps.delete(id);
  }
}
