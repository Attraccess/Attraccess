import path from 'path';
import { fileURLToPath } from 'url';

export type Action = 'up' | 'stop' | 'down' | 'status' | 'list';

export const ACTIONS: Action[] = ['up', 'stop', 'down', 'status', 'list'];

export const SETS: Record<string, string[]> = {
  mailpit: ['mailpit'],
  valkey: ['valkey'],
  authentik: ['authentik-postgresql', 'authentik-redis', 'authentik-server', 'authentik-worker'],
  keycloak: ['keycloak'],
  'webhook-site': ['webhook-site'],
  rabbitmq: ['rabbitmq'],
  zigbee2mqtt: ['zigbee2mqtt'],
  monitoring: ['prometheus', 'grafana'],
};

export const DEFAULT_SETS = ['mailpit'];

export const scriptPath = fileURLToPath(import.meta.url);

export const scriptDir = path.dirname(scriptPath);

export const repoRoot = path.resolve(scriptDir, '..');

export const composeFile = path.join(repoRoot, 'services.docker-compose.yml');
