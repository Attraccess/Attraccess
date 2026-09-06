import { UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest, PluginContext } from '@attraccess/plugins-backend-sdk';
import { randomUUID } from 'node:crypto';

// Structurally identical to ATT-983's PluginAuditPrincipal. The commissioning
// stack can load before that SDK addition; it never supplies a second sink.
export interface CommissioningPrincipal {
  userId: number;
  authenticationMethod: 'session' | 'api-token';
  apiTokenId?: number;
}

export function commissioningPrincipal(request: Pick<AuthenticatedRequest, 'user'>): CommissioningPrincipal {
  const user = request?.user;
  const method = user?.authenticationMethod ?? 'session';
  if (
    !Number.isSafeInteger(user?.id) ||
    user.id < 1 ||
    !['session', 'api-token'].includes(method) ||
    (method === 'api-token' && (!Number.isSafeInteger(user.apiTokenId) || user.apiTokenId < 1))
  )
    throw new UnauthorizedException();
  return {
    userId: user.id,
    authenticationMethod: method as CommissioningPrincipal['authenticationMethod'],
    ...(method === 'api-token' ? { apiTokenId: user.apiTokenId } : {}),
  };
}

export async function auditCommissioning<T>(
  context: PluginContext,
  principal: CommissioningPrincipal | null,
  id: number,
  action:
    | 'install'
    | 'recover'
    | 'claim'
    | 'security_inspect'
    | 'security_review'
    | 'security_apply'
    | 'security_recover'
    | 'platform_inspect'
    | 'platform_activate'
    | 'platform_recover'
    | 'lease_recover',
  operation: () => Promise<T>,
  succeeded: (result: T) => boolean = () => true,
): Promise<T> {
  const operationId = randomUUID();
  const host = context as PluginContext & {
    audit?: {
      record(event: {
        action: string;
        operationId: string;
        principal: CommissioningPrincipal;
        outcome: 'attempted' | 'succeeded' | 'failed';
        subject: { type: string; id: number };
        details: Record<string, never>;
      }): Promise<{ status: 'recorded' | 'unavailable' }>;
    };
  };
  const record = async (outcome: 'attempted' | 'succeeded' | 'failed') => {
    try {
      // A legacy session has no authenticated initiator; never invent an actor.
      const receipt =
        principal &&
        (await host.audit?.record({
          action: action === 'claim' ? 'wago.claim' : `wago.commissioning.${action}`,
          operationId,
          principal,
          outcome,
          subject: { type: action === 'claim' ? 'wago.controller' : 'wago.commissioning', id },
          details: {},
        }));
      if (!receipt || receipt.status !== 'recorded') context.logger?.warn('WAGO audit storage unavailable');
    } catch {
      context.logger?.warn('WAGO audit storage unavailable');
    }
  };
  await record('attempted');
  try {
    const result = await operation();
    await record(succeeded(result) ? 'succeeded' : 'failed');
    return result;
  } catch (error) {
    await record('failed');
    throw error;
  }
}
