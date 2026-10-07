import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type {
  AuthenticatedRequest,
  PluginAuditPrincipal,
  PluginAuditReceipt,
  PluginContext,
} from '@attraccess/plugins-backend-sdk';
import { WAGO_AUDIT_ACTIONS } from './wago-audit.wago-audit-actions';
import { WagoAuditAction } from './wago-audit.contracts';
import { WagoAuditDetails } from './wago-audit.wago-audit-details';
import { WagoAuditLifecycle } from './wago-audit.contracts';
import { wagoAuditPrincipal } from './wago-audit.helpers';
import { wagoAuditDetails } from './wago-audit.wago-audit-details';
import { positiveInteger } from './wago-audit.helpers';

/** A lifecycle belongs to one authenticated administration operation, not a telemetry report. */
export class WagoAudit {
  constructor(private readonly context: Pick<PluginContext, 'audit' | 'logger'>) {}

  async run<T>(
    principal: PluginAuditPrincipal,
    controllerId: number,
    action: WagoAuditAction,
    details: WagoAuditDetails,
    operation: () => Promise<T>,
    completed: (value: T) => WagoAuditDetails = () => ({}),
  ): Promise<T> {
    const lifecycle = this.begin(principal, controllerId, action, details);
    await lifecycle.attempt();
    let value: T;
    try {
      value = await operation();
    } catch (error) {
      await lifecycle.finish('failed');
      throw error;
    }
    await lifecycle.finish('succeeded', completed(value));
    return value;
  }

  /** For owners with asynchronous dispatch/ack lifecycles. Finish exactly once after the true outcome. */
  begin(
    principal: PluginAuditPrincipal,
    controllerId: number,
    action: WagoAuditAction,
    details: WagoAuditDetails = {},
  ): WagoAuditLifecycle {
    if (!positiveInteger(controllerId) || !WAGO_AUDIT_ACTIONS.includes(action))
      throw new BadRequestException('Invalid WAGO audit subject or action');
    const actor = wagoAuditPrincipal({
      user: {
        id: principal.userId,
        authenticationMethod: principal.authenticationMethod,
        apiTokenId: principal.apiTokenId,
      },
    } as Pick<AuthenticatedRequest, 'user'>);
    const operationId = randomUUID();
    const initial = wagoAuditDetails(details);
    let attempted: Promise<PluginAuditReceipt> | undefined;
    let finished: Promise<PluginAuditReceipt> | undefined;
    const record = async (
      outcome: 'attempted' | 'succeeded' | 'failed',
      extra: WagoAuditDetails = {},
    ): Promise<PluginAuditReceipt> => {
      let receipt: PluginAuditReceipt;
      try {
        receipt = (await this.context.audit?.record({
          action: `wago.${action}`,
          operationId,
          principal: { ...actor },
          outcome,
          subject: { type: 'wago.controller', id: controllerId },
          details: { ...initial, ...wagoAuditDetails(extra) },
        })) ?? { status: 'unavailable' };
      } catch {
        receipt = { status: 'unavailable' };
      }
      if (receipt.status === 'unavailable') this.context.logger.warn('WAGO audit storage unavailable');
      return receipt;
    };
    const attempt = () => (attempted ??= record('attempted'));
    return {
      operationId,
      attempt,
      finish: (outcome: 'succeeded' | 'failed', extra: WagoAuditDetails = {}) =>
        (finished ??= (async () => {
          await attempt();
          return record(outcome, extra);
        })()),
    };
  }
}

export { WAGO_AUDIT_ACTIONS } from './wago-audit.wago-audit-actions';
export { type WagoAuditAction } from './wago-audit.contracts';
export { type WagoAuditSummary } from './wago-audit.wago-audit-summary';
export { type WagoAuditDetails } from './wago-audit.wago-audit-details';
export { type WagoRevisionAuditResult } from './wago-audit.contracts';
export { type WagoPresetAuditResult } from './wago-audit.contracts';
export { type WagoProfileAuditResult } from './wago-audit.contracts';
export { type WagoManualCommandAuditResult } from './wago-audit.contracts';
export { type WagoAuditLifecycle } from './wago-audit.contracts';
export { wagoAuditPrincipal } from './wago-audit.helpers';
export { wagoAuditSummary } from './wago-audit.wago-audit-summary';
export { wagoAuditDetails } from './wago-audit.wago-audit-details';
