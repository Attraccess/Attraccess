import { BillingTransaction, BillingTransactionItem, Resource, ResourceUsage } from '@attraccess/database-entities';
import { registerEmailServiceFixture } from './email.service.email-service.test-fixture';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));
export function registerSendsBillingTransactionSummaryEmailWithExpectedContextCases(
  fixture: ReturnType<typeof registerEmailServiceFixture>,
) {
  it('sends billing transaction summary email with expected context', async () => {
    const { service, sendMail } = fixture.setup();
    const user = fixture.makeUser({ id: 7, username: 'dana', email: 'dana@example.com', creditBalance: 1234 });

    const transaction: Partial<BillingTransaction> = {
      id: 99,
      userId: 7,
      amount: -345, // charged 345 credits
      items: [
        { name: 'PER_SESSION', unitPrice: 100, quantity: 1 },
        { name: 'PER_MINUTE', unitPrice: 5, quantity: 70 },
        { name: 'BILLING_FACTOR', unitPrice: -55, quantity: 1 },
      ] as unknown as BillingTransactionItem[],
    };

    const usage: Partial<ResourceUsage> = {
      startTime: new Date('2024-01-01T10:00:00Z'),
      endTime: new Date('2024-01-01T11:10:00Z'),
      usageInMinutes: 999, // The settled item quantity, not a recalculation, is authoritative.
      resource: { id: 3, name: 'Laser Cutter' } as Resource,
      user,
    };

    await service.sendResourceUsageBillingSummaryEmail(
      user,
      transaction as BillingTransaction,
      usage as ResourceUsage,
      2,
    );

    expect(sendMail).toHaveBeenCalledTimes(1);
    const callArg = (sendMail as jest.Mock).mock.calls[0][0];
    expect(callArg.to).toBe('dana@example.com');
    expect(callArg.subject).toContain('Laser Cutter');
    expect(callArg.html).toContain('dana');
    expect(callArg.html).toContain('Laser Cutter');
    expect(callArg.html).toContain('70');
    // With minor unit 2, amounts are converted to user currency strings
    expect(callArg.html).toContain('3.45');
    expect(callArg.html).toContain('12.34');
    expect(callArg.html).not.toContain('999');
  });
}
