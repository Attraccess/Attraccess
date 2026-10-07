import { ValidationPipe } from '@nestjs/common';
import { AuditQueryDto } from './audit-query.dto';
import { registerPluginAuditDomains, resetPluginAuditRegistry } from '../plugin-system/plugin-audit-registry';
import { registerAuditAuthorizationAndQueryValidationFixture } from './audit.audit-authorization-and-query-validation.test-fixture';
export function registerValidatesAuditQueryBoundsAndAllowsTheRegisteredResourceAndBillingFiltersCases(
  fixture: ReturnType<typeof registerAuditAuthorizationAndQueryValidationFixture>,
) {
  it('validates audit query bounds and allows the registered resource and billing filters', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    for (const query of [{ limit: '101' }, { beforeId: '-1' }, { raw: 'secret' }]) {
      await expect(pipe.transform(query, { type: 'query', metatype: AuditQueryDto })).rejects.toThrow();
    }
    expect(await pipe.transform({ limit: '5' }, { type: 'query', metatype: AuditQueryDto })).toEqual({ limit: 5 });
    await expect(
      pipe.transform({ eventPrefix: 'maintenance_schedule.' }, { type: 'query', metatype: AuditQueryDto }),
    ).resolves.toMatchObject({ eventPrefix: 'maintenance_schedule.' });
    await expect(
      pipe.transform({ eventPrefix: 'supervision.' }, { type: 'query', metatype: AuditQueryDto }),
    ).resolves.toMatchObject({ eventPrefix: 'supervision.' });
    const billingFilters = {
      domain: 'billing',
      eventPrefix: 'billing.transaction.',
      action: 'billing.transaction.updated',
      subjectType: 'billing.transaction',
    };
    await expect(pipe.transform(billingFilters, { type: 'query', metatype: AuditQueryDto })).resolves.toMatchObject(
      billingFilters,
    );
    await expect(
      pipe.transform({ domain: 'sso', action: 'sso.provider.created' }, { type: 'query', metatype: AuditQueryDto }),
    ).resolves.toMatchObject({ domain: 'sso', action: 'sso.provider.created' });
    await expect(
      pipe.transform(
        {
          eventPrefix: 'resource_group.',
          action: 'introduction.granted',
          subjectType: 'resource_group',
          domain: 'resource',
        },
        { type: 'query', metatype: AuditQueryDto },
      ),
    ).resolves.toMatchObject({ action: 'introduction.granted', subjectType: 'resource_group', domain: 'resource' });
    await expect(
      pipe.transform(
        {
          eventPrefix: 'billing.',
          action: 'billing.transaction.created',
          subjectType: 'billing.transaction',
          domain: 'billing',
        },
        { type: 'query', metatype: AuditQueryDto },
      ),
    ).resolves.toMatchObject({
      action: 'billing.transaction.created',
      subjectType: 'billing.transaction',
      domain: 'billing',
    });
    for (const subjectType of ['project', 'project.member', 'project.invitation']) {
      await expect(
        pipe.transform({ domain: 'project', subjectType }, { type: 'query', metatype: AuditQueryDto }),
      ).resolves.toMatchObject({ domain: 'project', subjectType });
    }
    // Plugin-contributed filter values validate against the live registry.
    resetPluginAuditRegistry();
    registerPluginAuditDomains({ name: 'query-fixture', id: 'q'.repeat(21) }, [fixture.demoDomain]);
    try {
      const pluginFilters = {
        domain: 'demo',
        eventPrefix: 'demo.commissioning.',
        action: 'demo.commissioning.install',
        subjectType: 'demo.device',
      };
      await expect(pipe.transform(pluginFilters, { type: 'query', metatype: AuditQueryDto })).resolves.toMatchObject(
        pluginFilters,
      );
      for (const query of [
        { domain: 'Demo' },
        { domain: 'demo-device' },
        { domain: 'unregistered' },
        { action: 'demo.Action' },
        { action: '.demo' },
        { action: 'demo.unregistered_action' },
        { subjectType: 'demo..device' },
        { subjectType: 'demo.unregistered' },
        { eventPrefix: 'demo.%' },
        { eventPrefix: 'unregistered.' },
      ]) {
        await expect(pipe.transform(query, { type: 'query', metatype: AuditQueryDto })).rejects.toThrow();
      }
    } finally {
      resetPluginAuditRegistry();
    }
  });
}
