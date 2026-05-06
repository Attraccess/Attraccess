// Migration test for introduction email templates seed and CHECK widening
// FEATURE: User retraining requirement (ATT-106)
import { DataSource } from 'typeorm';
import { SeedIntroductionEmailTemplates1778016390001 } from '../1778016390001-seed-introduction-email-templates';

describe('Migration: seed-introduction-email-templates', () => {
  let ds: DataSource;

  beforeEach(async () => {
    ds = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: false,
    });
    await ds.initialize();

    await ds.query(
      `CREATE TABLE "email_templates" ("type" varchar CHECK( "type" IN ('verify-email','user-invitation','reset-password','username-changed','password-changed','resource-usage-billing-transaction-summary','project-invitation','delete-account-confirmation') ) PRIMARY KEY NOT NULL, "subject" varchar(255) NOT NULL, "body" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "variables" text NOT NULL)`,
    );
    await ds.query(
      `INSERT INTO "email_templates" ("type", "subject", "body", "variables") VALUES ('verify-email', 'Verify your email', 'legacy body', 'user.username')`,
    );
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('runs up, down, up while preserving legacy and seeding new template rows', async () => {
    const migration = new SeedIntroductionEmailTemplates1778016390001();
    const runner = ds.createQueryRunner();

    await migration.up(runner);

    const newRowsAfterUp = await runner.query(
      `SELECT "type" FROM "email_templates" WHERE "type" IN ('introduction-expiry-warning','introduction-expired') ORDER BY "type"`,
    );
    expect(newRowsAfterUp.length).toBe(2);
    expect(newRowsAfterUp.map((r: { type: string }) => r.type)).toEqual([
      'introduction-expired',
      'introduction-expiry-warning',
    ]);

    const legacyAfterUp = await runner.query(
      `SELECT "type", "subject", "body" FROM "email_templates" WHERE "type" = 'verify-email'`,
    );
    expect(legacyAfterUp.length).toBe(1);
    expect(legacyAfterUp[0].subject).toBe('Verify your email');
    expect(legacyAfterUp[0].body).toBe('legacy body');

    await migration.down(runner);

    const newRowsAfterDown = await runner.query(
      `SELECT "type" FROM "email_templates" WHERE "type" IN ('introduction-expiry-warning','introduction-expired')`,
    );
    expect(newRowsAfterDown.length).toBe(0);

    const legacyAfterDown = await runner.query(
      `SELECT "type" FROM "email_templates" WHERE "type" = 'verify-email'`,
    );
    expect(legacyAfterDown.length).toBe(1);

    await migration.up(runner);

    const newRowsAfterUp2 = await runner.query(
      `SELECT "type" FROM "email_templates" WHERE "type" IN ('introduction-expiry-warning','introduction-expired') ORDER BY "type"`,
    );
    expect(newRowsAfterUp2.length).toBe(2);

    await runner.release();
  });
});
