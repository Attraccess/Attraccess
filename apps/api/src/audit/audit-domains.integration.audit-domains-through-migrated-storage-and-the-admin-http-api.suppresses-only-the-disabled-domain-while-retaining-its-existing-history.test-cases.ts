import { registerAuditDomainsThroughMigratedStorageAndTheAdminHttpApiFixture } from './audit-domains.integration.audit-domains-through-migrated-storage-and-the-admin-http-api.test-fixture';
export function registerSuppressesOnlyTheDisabledDomainWhileRetainingItsExistingHistoryCases(
  fixture: ReturnType<typeof registerAuditDomainsThroughMigratedStorageAndTheAdminHttpApiFixture>,
) {
  it.each(fixture.scenarios)(
    'suppresses only the disabled $domain while retaining its existing history',
    async (scenario) => {
      await fixture.emitAll();
      await fixture.configure(fixture.disable(scenario.domain)).expect(200);
      await fixture.emitAll();
      const { body } = await fixture.read().expect(200);
      for (const domain of fixture.domains)
        expect(fixture.scenarioEntries(body.items).filter((item) => item.domain === domain)).toHaveLength(
          domain === scenario.domain ? 1 : 2,
        );
    },
  );
}
