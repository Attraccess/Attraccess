import {
  ResourceMeter,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceMeteringSession,
  ResourceUsage,
} from '@attraccess/database-entities';
import { EmailService } from '../../email/email.service';
import { readDefaultTemplateBody, SHIPPED_TRANSLATIONS } from '../../email-template/email-defaults';
import { EmailTemplateType } from '@attraccess/database-entities';
import Handlebars from 'handlebars';
import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersCarriesPaidFreeZeroAndUnavailableMeterEvidenceFromSettlementIntoTheSReceipt(
  scope: GenericMetersTestScope,
): void {
  it.each(['en', 'de'])(
    'carries paid, free, zero and unavailable meter evidence from settlement into the %s receipt',
    async (locale) => {
      await scope.seedMeter({}, { finalAttempts: 1 });
      const meters = scope.source.getRepository(ResourceMeter);
      const free = await meters.save({ resourceId: 1, name: 'Free Heartbeats', creditsPerUnit: 0 });
      const zero = await meters.save({ resourceId: 1, name: 'Zero Heartbeats', creditsPerUnit: 0 });
      const unavailable = await meters.save({ resourceId: 1, name: 'PER_MINUTE', creditsPerUnit: 17 });
      const nodes = scope.source.getRepository(ResourceFlowNode);
      const edges = scope.source.getRepository(ResourceFlowEdge);
      for (const meter of [free, zero, unavailable]) {
        for (const node of await nodes.find({ where: { resourceId: 1 } })) {
          if (node.data.meterId !== 1) continue;
          await nodes.save({ ...node, id: `${node.id}-${meter.id}`, data: { ...node.data, meterId: meter.id } });
        }
        await edges.save([
          {
            id: `start-${meter.id}`,
            resourceId: 1,
            source: `start-${meter.id}`,
            sourceHandle: 'output',
            target: `ready-${meter.id}`,
            targetHandle: 'input',
          },
          {
            id: `collect-${meter.id}`,
            resourceId: 1,
            source: `collect-${meter.id}`,
            sourceHandle: 'output',
            target: `report-${meter.id}`,
            targetHandle: 'input',
          },
        ]);
      }
      const started = await scope.usage.startSession(1, scope.users[0], {} as never);
      await scope.metering.updateMeter(1, free.id, 'Renamed later');
      await scope.metering.setRate(1, free.id, 100);
      scope.onCollect = async ({ complete, meterId }) => {
        if (meterId === unavailable.id) throw new Error('Device offline');
        await complete({ kind: 'reading', value: meterId === zero.id ? '0' : '1.5' });
      };
      await scope.usage.endSession(1, scope.users[0], {} as never);
      const bill = await scope.items(started.id);
      expect(bill.transaction.amount).toBe(-45);
      expect(bill.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Energy (kWh)',
            meterQuantity: '1.5',
            meterCreditsPerUnit: 30,
            unitPrice: 45,
          }),
          expect.objectContaining({
            name: 'Free Heartbeats',
            meterQuantity: '1.5',
            meterCreditsPerUnit: 0,
            unitPrice: 0,
          }),
          expect.objectContaining({
            name: 'Zero Heartbeats',
            meterQuantity: '0',
            meterCreditsPerUnit: 0,
            unitPrice: 0,
          }),
          expect.objectContaining({ name: 'PER_MINUTE', meterQuantity: null, meterCreditsPerUnit: 17, unitPrice: 0 }),
        ]),
      );
      expect(bill.items).toHaveLength(4);
      const email = Object.create(EmailService.prototype) as EmailService;
      const sendEmail = jest.fn();
      Object.assign(email, { getBaseContext: async () => ({}), sendEmail });
      const storedUsage = await scope.source
        .getRepository(ResourceUsage)
        .findOneOrFail({ where: { id: started.id }, relations: ['resource'] });
      await email.sendResourceUsageBillingSummaryEmail(
        Object.assign(scope.users[0], { email: 'owner@example.com', locale }),
        Object.assign(bill.transaction, { items: bill.items }),
        storedUsage,
        2,
      );
      const context = sendEmail.mock.calls[0][2];
      const renderer = Handlebars.create();
      renderer.registerHelper('t', (key, fallback, options) => {
        const value =
          SHIPPED_TRANSLATIONS.find(
            (row) =>
              row.templateType === EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY &&
              row.locale === locale &&
              row.key === key,
          )?.value ?? fallback;
        return String(value).replace(/\{(\w+)\}/g, (_match, name) => String(options.hash[name] ?? ''));
      });
      const receipt = renderer.compile(
        readDefaultTemplateBody(EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY),
      )(context);
      for (const name of ['Free Heartbeats', 'Zero Heartbeats', 'PER_MINUTE']) expect(receipt).toContain(name);
      expect(receipt).toContain(locale === 'de' ? 'Nicht verfügbar' : 'Unavailable');
      expect(receipt).not.toContain('Renamed later');
      expect(context.items.find((item: { name: string }) => item.name === 'PER_MINUTE')).toMatchObject({
        isUnavailable: true,
        isDuration: false,
        quantity: '—',
      });
      expect(context.totalCredits).toBe('0.45');
      expect(context.usage.roundedMinutes).toBeUndefined();
      const before = await scope.items(started.id);
      const pending = await scope.source
        .getRepository(ResourceMeteringSession)
        .findOneByOrFail({ usageId: started.id, meterId: unavailable.id });
      scope.onCollect = scope.reading('2', { observedAt: storedUsage.endTime?.toISOString() });
      await scope.metering.retrySettlement(1, pending.id, scope.users[0].id);
      expect(await scope.items(started.id)).toEqual(before);
      expect((await scope.correctionsOf(started.id)).corrections).toEqual([expect.objectContaining({ amount: -34 })]);
    },
  );
}
