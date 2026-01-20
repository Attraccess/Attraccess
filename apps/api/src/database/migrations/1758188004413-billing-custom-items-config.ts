import { MigrationInterface, QueryRunner } from 'typeorm';

export class BillingCustomItemsConfig1758188004413 implements MigrationInterface {
  name = 'BillingCustomItemsConfig1758188004413';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_billing_transaction_item" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "billingTransactionId" integer NOT NULL, "name" varchar NOT NULL, "description" varchar, "externalReference" varchar, CONSTRAINT "FK_2455de178cbdab7028200076b03" FOREIGN KEY ("billingTransactionId") REFERENCES "billing_transaction" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_billing_transaction_item"("id", "billingTransactionId", "name", "description", "externalReference") SELECT "id", "billingTransactionId", "name", "description", "externalReference" FROM "billing_transaction_item"`,
    );
    await queryRunner.query(`DROP TABLE "billing_transaction_item"`);
    await queryRunner.query(`ALTER TABLE "temporary_billing_transaction_item" RENAME TO "billing_transaction_item"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_billing_transaction_item" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "billingTransactionId" integer NOT NULL, "name" varchar NOT NULL, "description" varchar, "externalReference" varchar, "unitPrice" integer NOT NULL, "quantity" integer NOT NULL, CONSTRAINT "FK_2455de178cbdab7028200076b03" FOREIGN KEY ("billingTransactionId") REFERENCES "billing_transaction" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_billing_transaction_item"("id", "billingTransactionId", "name", "description", "externalReference", "unitPrice", "quantity") SELECT "id", "billingTransactionId", "name", "description", "externalReference", 0, 0 FROM "billing_transaction_item"`,
    );
    await queryRunner.query(`DROP TABLE "billing_transaction_item"`);
    await queryRunner.query(`ALTER TABLE "temporary_billing_transaction_item" RENAME TO "billing_transaction_item"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "billing_transaction_item" RENAME TO "temporary_billing_transaction_item"`);
    await queryRunner.query(
      `CREATE TABLE "billing_transaction_item" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "billingTransactionId" integer NOT NULL, "name" varchar NOT NULL, "description" varchar, "externalReference" varchar, "value" integer NOT NULL, CONSTRAINT "FK_2455de178cbdab7028200076b03" FOREIGN KEY ("billingTransactionId") REFERENCES "billing_transaction" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "billing_transaction_item"("id", "billingTransactionId", "name", "description", "externalReference", "value") SELECT "id", "billingTransactionId", "name", "description", "externalReference", "unitPrice" * "quantity" FROM "temporary_billing_transaction_item"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_billing_transaction_item"`);
  }
}
