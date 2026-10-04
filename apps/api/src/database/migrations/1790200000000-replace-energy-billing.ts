import { MigrationInterface, QueryRunner } from 'typeorm';
import { EmailTemplateType } from '@attraccess/database-entities';
import { refreshDefaultEmailTemplate } from '../migration-helpers/refresh-default-email-template';

/** Completes the replacement even on databases that already ran GenericMeters. */
export class ReplaceEnergyBilling1790200000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    // Some historical usages have a captured rate but no metering session/flow left.
    const resources: { resourceId: number }[] = await runner.query(
      'SELECT DISTINCT resourceId FROM resource_usage WHERE energyCreditsPerKwh > 0',
    );
    for (const { resourceId } of resources) {
      await runner.query(
        `INSERT INTO resource_meter(resourceId, name)
         SELECT ?, 'Energy (kWh)' WHERE NOT EXISTS
         (SELECT 1 FROM resource_meter WHERE resourceId = ? AND name = 'Energy (kWh)')
         AND NOT EXISTS (SELECT 1 FROM resource_metering_session WHERE resourceId = ? AND meterName = 'Energy (kWh)')`,
        [resourceId, resourceId, resourceId],
      );
    }

    const usages: { id: number; resourceId: number; energyCreditsPerKwh: number | null }[] = await runner.query(
      `SELECT id, resourceId, energyCreditsPerKwh FROM resource_usage u WHERE meterRates IS NULL
       AND (energyCreditsPerKwh > 0 OR EXISTS (SELECT 1 FROM resource_metering_session WHERE usageId = u.id))`,
    );
    for (const usage of usages) {
      const rates: { meterId: number; name: string; creditsPerUnit: number }[] = await runner.query(
        'SELECT meterId, meterName AS name, creditsPerUnit FROM resource_metering_session WHERE usageId = ? ORDER BY meterId',
        [usage.id],
      );
      if (!rates.length && (usage.energyCreditsPerKwh ?? 0) > 0) {
        const [meter]: { id: number; name: string }[] = await runner.query(
          `SELECT id, name FROM resource_meter WHERE resourceId = ? AND
           (name = 'Energy (kWh)' OR id IN
           (SELECT meterId FROM resource_metering_session WHERE resourceId = ? AND meterName = 'Energy (kWh)'))
           ORDER BY CASE WHEN name = 'Energy (kWh)' THEN 1 ELSE 0 END, id LIMIT 1`,
          [usage.resourceId, usage.resourceId],
        );
        rates.push({ meterId: meter.id, name: meter.name, creditsPerUnit: usage.energyCreditsPerKwh as number });
      }
      // Empty snapshots prevent old free usages from adopting today's meter prices.
      await runner.query('UPDATE resource_usage SET meterRates = ? WHERE id = ?', [JSON.stringify(rates), usage.id]);
    }
    await runner.query("UPDATE resource_usage SET meterRates = '[]' WHERE meterRates IS NULL");

    const items: { id: number; energyMicroWh: string | null; energyCreditsPerKwh: number | null }[] =
      await runner.query(`SELECT id, energyMicroWh, energyCreditsPerKwh FROM billing_transaction_item
        WHERE energyMicroWh IS NOT NULL OR energyCreditsPerKwh IS NOT NULL`);
    for (const item of items) {
      // µWh and billionths of kWh have the same scale. Format without floating point.
      const value = item.energyMicroWh == null ? null : BigInt(item.energyMicroWh);
      const scale = BigInt(1_000_000_000);
      const fraction = value == null ? '' : (value % scale).toString().padStart(9, '0').replace(/0+$/, '');
      const quantity = value == null ? null : `${value / scale}${fraction ? '.' + fraction : ''}`;
      await runner.query(
        `UPDATE billing_transaction_item SET meterQuantity = COALESCE(meterQuantity, ?),
         meterCreditsPerUnit = COALESCE(meterCreditsPerUnit, ?),
         name = CASE WHEN name = 'ENERGY' THEN 'Energy (kWh)' ELSE name END WHERE id = ?`,
        [quantity, item.energyCreditsPerKwh, item.id],
      );
    }

    // Repair a baseline lost by the earlier generic migration when no reading followed start.
    await runner.query(`UPDATE resource_meter SET counterValue =
      (SELECT COALESCE(s.baselineValue, '0') FROM resource_metering_session s
       WHERE s.meterId = resource_meter.id ORDER BY s.createdAt DESC, s.usageId DESC LIMIT 1)
      WHERE counterValue IS NULL AND
      (SELECT s.collectionMode = 'requested' AND s.latestValue IS NULL FROM resource_metering_session s
       WHERE s.meterId = resource_meter.id ORDER BY s.createdAt DESC, s.usageId DESC LIMIT 1)`);

    // Native DROP COLUMN preserves generated usage columns, indexes, triggers and references.
    await runner.query('ALTER TABLE resource_billing_configuration DROP COLUMN creditsPerKwh');
    await runner.query('ALTER TABLE resource_usage DROP COLUMN energyCreditsPerKwh');
    await runner.query('ALTER TABLE billing_transaction_item DROP COLUMN energyMicroWh');
    await runner.query('ALTER TABLE billing_transaction_item DROP COLUMN energyCreditsPerKwh');

    await refreshDefaultEmailTemplate(runner, EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY, [
      '08932de65ce3334d43bb676deed46ba333e7a0f69145acfa06b6fd092a34a1b8',
    ]);
  }

  async down(runner: QueryRunner): Promise<void> {
    // Roll back to the preceding generic-meter version without undoing converted evidence.
    // GenericMeters.down refuses history the original energy-only model cannot represent.
    await runner.query('ALTER TABLE resource_billing_configuration ADD creditsPerKwh integer NOT NULL DEFAULT 0');
    await runner.query('ALTER TABLE resource_usage ADD energyCreditsPerKwh integer');
    await runner.query('ALTER TABLE billing_transaction_item ADD energyMicroWh varchar');
    await runner.query('ALTER TABLE billing_transaction_item ADD energyCreditsPerKwh integer');
  }
}
