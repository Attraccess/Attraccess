import type {
  AuthenticatedUser,
  PluginAuditDomainDeclaration,
  PluginAuditPrincipal,
  PluginContext,
} from '@attraccess/plugins-backend-sdk';
import { randomUUID } from 'node:crypto';

// Audit policy for the message explorer. Details carry the topic and the size
// only — never the payload.
export const RABBITMQ_AUDIT_DOMAIN: PluginAuditDomainDeclaration = {
  domain: 'rabbitmq',
  labels: { en: 'RabbitMQ', de: 'RabbitMQ' },
  actions: [
    {
      action: 'rabbitmq.message_subscribe',
      subjectTypes: ['rabbitmq.mqtt_server'],
      details: { topic: { type: 'string', maxLength: 256 } },
    },
    {
      action: 'rabbitmq.message_publish',
      subjectTypes: ['rabbitmq.mqtt_server'],
      details: {
        topic: { type: 'string', maxLength: 256 },
        size: { type: 'number', integer: true, min: 0 },
        qos: { type: 'number', oneOf: [0, 1, 2] },
        retain: { type: 'boolean' },
      },
    },
  ],
};

export function principalOf(user: AuthenticatedUser): PluginAuditPrincipal {
  return {
    userId: user.id,
    authenticationMethod: user.authenticationMethod ?? 'session',
    ...(user.apiTokenId !== undefined ? { apiTokenId: user.apiTokenId } : {}),
  };
}

// Records one explorer action. A missing or failing audit sink never fails the
// request.
export async function recordMessageAudit(
  context: Pick<PluginContext, 'audit' | 'logger'>,
  action: 'rabbitmq.message_subscribe' | 'rabbitmq.message_publish',
  user: AuthenticatedUser,
  mqttServerId: number,
  details: Record<string, string | number | boolean>,
): Promise<void> {
  try {
    await context.audit?.record({
      action,
      operationId: randomUUID(),
      principal: principalOf(user),
      outcome: 'succeeded',
      subject: { type: 'rabbitmq.mqtt_server', id: mqttServerId },
      details,
    });
  } catch {
    context.logger.warn?.('Recording a RabbitMQ message explorer action in the audit log failed.');
  }
}
