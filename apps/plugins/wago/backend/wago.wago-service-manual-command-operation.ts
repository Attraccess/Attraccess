import { WagoAudit } from './wago-audit';
import type { WagoManualCommandAuditResult } from './wago-audit';
import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type { PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';
import { WagoCommandError } from './wago-command-handler';
import { WagoServiceExecuteCommandOperation } from './wago.wago-service-execute-command-operation';


export abstract class WagoServiceManualCommandOperation extends WagoServiceExecuteCommandOperation {
  async manualCommand(
    controllerId: number,
    input: Record<string, unknown>,
    principal: PluginAuditPrincipal,
  ): Promise<WagoManualCommandAuditResult> {
    const keys = ['channelId', 'action', 'value', 'expectedConfigurationRevision', 'acknowledgementTimeoutSeconds'];
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).some((key) => !keys.includes(key))
    )
      throw new BadRequestException('Invalid manual command');
    if (typeof input.channelId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(input.channelId))
      throw new BadRequestException('Invalid Logical Channel');
    const config = { ...input, controllerId, completionBehavior: 'acknowledged' };
    const errors = await this.commands.validate(config, new Map(), true);
    if (errors.length) throw new BadRequestException('Manual command does not match the applied configuration');
    const commandId = randomUUID();
    const details = { commandId, channelId: input.channelId, operation: input.action as 'set' | 'pulse' | 'release' };
    const lifecycle = new WagoAudit(this.context).begin(principal, controllerId, 'manual_command', details);
    await lifecycle.attempt();
    let result: WagoManualCommandAuditResult['result'];
    try {
      await this.commands.execute(config, commandId, 'manual');
      result = 'acknowledged';
    } catch (error) {
      result =
        error instanceof WagoCommandError
          ? error.kind === 'controller-rejection'
            ? 'rejected'
            : error.kind === 'acknowledgement-timeout'
              ? 'timeout'
              : 'transport_failure'
          : 'transport_failure';
    }
    await lifecycle.finish(result === 'acknowledged' ? 'succeeded' : 'failed', { result });
    return { ...details, result };
  }
}
