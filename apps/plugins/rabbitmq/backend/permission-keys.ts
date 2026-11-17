// The RabbitMQ permission keys as plain strings. No imports, so the frontend bundle can use them too. The backend
// declares them in ./permissions.ts.

export const RABBITMQ_BROKER_READ = 'rabbitmq.broker.read' as const;
export const RABBITMQ_BROKER_MANAGE = 'rabbitmq.broker.manage' as const;
