import type { ServiceInternals } from './npm-plugin.service.npm-plugin-service.test-fixture';
import { recordNpmBootMigrationOutcome } from './npm-plugin-audit-state';
import { projectAdministrationAuditEvent } from '../audit/audit-administration-policy';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PluginService } from './plugin.service';
import { NpmPluginService } from './npm-plugin.service';
import { registerNpmPluginServiceFixture } from './npm-plugin.service.npm-plugin-service.test-fixture';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
export function registerCorrelatesAPersistedInstallWithItsSBootResultWithoutExposingAuditContextCases(
  fixture: ReturnType<typeof registerNpmPluginServiceFixture>,
) {
  it.each(['succeeded', 'failed'] as const)(
    'correlates a persisted install with its %s boot result without exposing audit context',
    async (migrationOutcome) => {
      const name = '@attraccess/plugin';
      const tarball = await fixture.packageTarball(name, ['READ_USERS']);
      const shasum = createHash('sha1').update(tarball).digest('hex');
      const settings = {
        getPlainSetting: jest.fn(
          async (_parent, key) => ({ enabled: 'true', domains: '["administration"]', retention_days: '90' })[key],
        ),
      };
      const audit = {
        list: jest.fn().mockResolvedValue({ items: [] }),
        recordAdministration: jest.fn().mockResolvedValue({ status: 'recorded' }),
      };
      const service = new NpmPluginService(settings as never, undefined, audit as never);
      const internals = service as unknown as ServiceInternals;
      jest.spyOn(internals, 'hostVersion').mockReturnValue('1.9.0');
      jest.spyOn(service, 'packageMetadata').mockResolvedValue({
        versions: {
          '1.2.3': {
            version: '1.2.3',
            dist: {
              tarball: 'plugin',
              shasum,
            },
          },
        },
      });
      jest.spyOn(internals, 'download').mockResolvedValue(tarball);
      const state = fixture.auditState();
      state.context = { operationId: randomUUID(), actorId: 42, authenticationMethod: 'api-token', apiTokenId: 9 };
      await service.install(name, '1.2.3', undefined, state);
      expect(PluginService.prototype.requestRestart).not.toHaveBeenCalled();
      expect(service.listInstalled()[0]).not.toHaveProperty('pendingAudit');
      const persisted = JSON.parse(readFileSync(join(fixture.root, '.npm-plugin-state.json'), 'utf8'));
      expect(persisted[0].pendingAudit.operationId).toBe(state.context.operationId);
      expect(state.integrity).toBe(`sha1-${Buffer.from(shasum, 'hex').toString('base64')}`);
      expect(persisted[0].integrity).toBe(`sha1-${Buffer.from(shasum, 'hex').toString('base64')}`);
      await recordNpmBootMigrationOutcome(fixture.root, name, '1.2.3', migrationOutcome);
      const manifest = PluginService.getPlugins()[0];
      jest
        .spyOn(PluginService, 'getPluginsWithLoadStatus')
        .mockReturnValue([{ ...manifest, status: migrationOutcome === 'succeeded' ? 'loaded' : 'error' }]);
      jest.spyOn(PluginService, 'isPluginQuarantined').mockReturnValue(migrationOutcome === 'failed');
      const restarted = new NpmPluginService(settings as never, undefined, audit as never);
      await restarted.onApplicationBootstrap();
      const recorded = audit.recordAdministration.mock.calls[0][0];
      expect(projectAdministrationAuditEvent(recorded)).not.toBeNull();
      expect(recorded).toMatchObject({
        operationId: state.context.operationId,
        action: 'plugin.activation_completed',
        actorId: 42,
        authenticationMethod: 'api-token',
        apiTokenId: 9,
        outcome: migrationOutcome,
        details: {
          migrationOutcome,
          activationOutcome: migrationOutcome === 'succeeded' ? 'succeeded' : 'quarantined',
        },
      });
      await restarted.onApplicationBootstrap();
      expect(audit.recordAdministration).toHaveBeenCalledTimes(1);
      expect(JSON.parse(readFileSync(join(fixture.root, '.npm-plugin-state.json'), 'utf8'))[0]).not.toHaveProperty(
        'pendingAudit',
      );
    },
  );
}
