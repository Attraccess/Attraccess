import { registerDurableAuditSqliteFixture } from './audit.durable-audit-sqlite.test-fixture';
export function registerPreservesSharedAuditRowsThroughIdentityDowngradeAndReUpgradeCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('preserves shared audit rows through identity downgrade and re-upgrade', async () => {
    const rows = [
      [
        901,
        'resource',
        null,
        'resource.usage_auto_closed',
        '00000000-0000-4000-8000-000000000901',
        null,
        null,
        null,
        'resource.usage',
        11,
        null,
        null,
      ],
      [
        902,
        'demo',
        'abcdefghijklmnopqrstu',
        'demo.device_connected',
        '00000000-0000-4000-8000-000000000902',
        42,
        'api_token',
        7,
        'demo.device',
        12,
        '192.0.2.42',
        'Demo/1.0',
      ],
      [
        903,
        'resource',
        null,
        'resource.maintenance_started',
        '00000000-0000-4000-8000-000000000903',
        null,
        null,
        null,
        'resource.maintenance',
        13,
        '2001:db8::3',
        'Resource worker/1.0',
      ],
    ];

    for (const row of rows) {
      await fixture.source.query(
        `INSERT INTO "audit_log" ("id", "at", "domain", "pluginId", "action", "operationId", "actorId", "authenticationMethod", "apiTokenId", "outcome", "subjectType", "subjectId", "ipAddress", "userAgent", "details")
         VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, 'succeeded', ?, ?, ?, ?, '{"source":"migration-test"}')`,
        row,
      );
    }

    await fixture.identityMigration.down(fixture.source.createQueryRunner());
    await fixture.identityMigration.up(fixture.source.createQueryRunner());

    expect(
      await fixture.source
        .query(`SELECT "id", "pluginId", "actorId", "authenticationMethod", "apiTokenId", "ipAddress", "userAgent"
        FROM "audit_log" WHERE "id" IN (901, 902, 903) ORDER BY "id"`),
    ).toEqual([
      {
        id: 901,
        pluginId: null,
        actorId: null,
        authenticationMethod: null,
        apiTokenId: null,
        ipAddress: null,
        userAgent: null,
      },
      {
        id: 902,
        pluginId: 'abcdefghijklmnopqrstu',
        actorId: 42,
        authenticationMethod: 'api_token',
        apiTokenId: 7,
        ipAddress: '192.0.2.42',
        userAgent: 'Demo/1.0',
      },
      {
        id: 903,
        pluginId: null,
        actorId: null,
        authenticationMethod: null,
        apiTokenId: null,
        ipAddress: '2001:db8::3',
        userAgent: 'Resource worker/1.0',
      },
    ]);
    expect(
      (await fixture.source.query('PRAGMA index_list(audit_log)')).map(({ name }: { name: string }) => name),
    ).toEqual(
      expect.arrayContaining([
        'IDX_audit_log_at',
        'IDX_audit_log_domain_id',
        'IDX_audit_log_actor_id',
        'IDX_audit_log_subject_id',
        'IDX_audit_log_operation_id',
        'IDX_audit_log_domain_at',
      ]),
    );
    await expect(fixture.source.query("UPDATE audit_log SET outcome = 'failed' WHERE id = 901")).rejects.toThrow(
      'immutable',
    );
  });
}
