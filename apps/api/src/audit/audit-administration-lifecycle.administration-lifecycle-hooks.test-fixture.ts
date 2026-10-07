import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { InstalledNpmPlugin } from '../plugin-system/npm-plugin.service';
import { projectAdministrationAuditEvent } from './audit-administration-policy';

const req = { user: { id: 42, authenticationMethod: 'api-token', apiTokenId: 9 } } as AuthenticatedRequest;

const secret = 'SECRET_MUST_NOT_BE_RECORDED';

const plugin = {
  name: '@attraccess/example',
  version: '2.0.0',
  requestedSpec: '^2.0.0',
  registryId: 'default',
  registryUrl: `https://user:${secret}@registry.example/private?token=${secret}`,
  integrity: 'sha512-YWJj',
  permissions: ['resources.read'],
  state: 'active',
  installPath: '/private/plugins/example',
  classification: 'community',
} as InstalledNpmPlugin;

function recorder() {
  return { recordAdministration: jest.fn().mockResolvedValue(undefined) };
}

function recorded(audit: ReturnType<typeof recorder>) {
  const events = audit.recordAdministration.mock.calls.map(([event]) => event);
  for (const event of events) expect(projectAdministrationAuditEvent(event)).not.toBeNull();
  expect(JSON.stringify(events)).not.toContain(secret);
  return events;
}
export function registerAdministrationLifecycleHooksFixture() {
  return {
    get req() {
      return req;
    },
    get secret() {
      return secret;
    },
    get plugin() {
      return plugin;
    },
    get recorder() {
      return recorder;
    },
    get recorded() {
      return recorded;
    },
  };
}
