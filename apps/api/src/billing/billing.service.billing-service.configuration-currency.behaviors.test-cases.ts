import { Setting, BillingTransaction, BillingTransactionStatus, User } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { Currency } from './dto/set-configuration.dto';
import { registerBillingServiceFixture } from './billing.service.billing-service.test-fixture';
import { UserNotFoundException } from '../exceptions/user.notFound.exception';
import { InsufficientBalanceError } from './errors/insufficient-balance.error';

export function registerConfigurationCurrencyCases(fixture: ReturnType<typeof registerBillingServiceFixture>) {
  describe('configuration currency', () => {
    it('setConfiguration throws on invalid currency', async () => {
      await expect(fixture.service.setConfiguration({ currency: 'USD' as Currency })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('setConfiguration updates existing currency setting and returns configuration', async () => {
      fixture.settingRepository.findOneBy.mockResolvedValueOnce({
        id: 1,
        parent: 'billing',
        key: 'currency',
        value: 'EUR',
      } as Setting);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fixture.settingRepository.update.mockResolvedValue({} as any);
      // getConfiguration call
      fixture.settingRepository.findOneBy.mockResolvedValueOnce({
        id: 1,
        parent: 'billing',
        key: 'currency',
        value: 'EUR',
      } as Setting);

      const result = await fixture.service.setConfiguration({ currency: Currency.EUR });
      expect(fixture.settingRepository.update).toHaveBeenCalledWith(1, { value: Currency.EUR });
      expect(result).toEqual({ currency: Currency.EUR, minorUnit: 2 });
    });

    it('setConfiguration inserts currency when not existing and returns configuration', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fixture.settingRepository.findOneBy.mockResolvedValueOnce(null as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fixture.settingRepository.insert.mockResolvedValue({} as any);
      // getConfiguration call
      fixture.settingRepository.findOneBy.mockResolvedValueOnce({
        id: 2,
        parent: 'billing',
        key: 'currency',
        value: 'EUR',
      } as Setting);

      const result = await fixture.service.setConfiguration({ currency: Currency.EUR });
      expect(fixture.settingRepository.insert).toHaveBeenCalledWith({
        parent: 'billing',
        key: 'currency',
        value: Currency.EUR,
      });
      expect(result).toEqual({ currency: Currency.EUR, minorUnit: 2 });
    });

    it('getConfiguration returns defaults when no setting present', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fixture.settingRepository.findOneBy.mockResolvedValue(null as any);
      const result = await fixture.service.getConfiguration();
      expect(result).toEqual({ currency: Currency.EUR, minorUnit: 2 });
    });

    it('getConfiguration throws on unsupported currency value from DB', async () => {
      fixture.settingRepository.findOneBy.mockResolvedValue({ value: 'USD' } as Setting);
      await expect(fixture.service.getConfiguration()).rejects.toBeInstanceOf(Error);
    });
  });
}

export function registerCreateManualTransactionCases(fixture: ReturnType<typeof registerBillingServiceFixture>) {
  describe('createManualTransaction', () => {
    it('throws if user does not exist', async () => {
      fixture.userRepository.findOneBy.mockResolvedValue(null);

      await expect(fixture.service.createManualTransaction(1, 2, 100)).rejects.toBeInstanceOf(UserNotFoundException);
    });

    it('succeeds and saves the transaction when user exists', async () => {
      fixture.userRepository.findOneBy.mockResolvedValue({ id: 1, creditBalance: 5 } as User);
      fixture.billingTransactionRepository.save.mockResolvedValue({ id: 123 } as BillingTransaction);

      const result = await fixture.service.createManualTransaction(1, 2, 100);

      expect(fixture.billingTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, initiatorId: 2, amount: 100 }),
      );
      expect(result).toEqual({ id: 123 });
      expect(fixture.liveNotificationsService.notifyTransactionUpdate).toHaveBeenCalledWith({ id: 123 });
      expect(fixture.auditService.recordBillingTransaction).toHaveBeenCalledWith({
        transactionId: 123,
        userId: 1,
        initiatorId: 2,
        amount: 100,
        status: BillingTransactionStatus.Completed,
        source: 'manual',
      });
    });

    it('throws InsufficientBalanceError when resulting balance would be negative', async () => {
      fixture.userRepository.findOneBy.mockResolvedValue({ id: 1, creditBalance: 10 } as User);

      await expect(fixture.service.createManualTransaction(1, 2, -20, true)).rejects.toBeInstanceOf(
        InsufficientBalanceError,
      );
    });

    it('allows negative charge when balance stays non-negative', async () => {
      fixture.userRepository.findOneBy.mockResolvedValue({ id: 1, creditBalance: 50 } as User);
      fixture.billingTransactionRepository.save.mockResolvedValue({ id: 456 } as BillingTransaction);

      const result = await fixture.service.createManualTransaction(1, 2, -20, true);

      expect(fixture.billingTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, initiatorId: 2, amount: -20 }),
      );
      expect(result).toEqual({ id: 456 });
    });

    it('throws when amount is fractional', async () => {
      fixture.userRepository.findOneBy.mockResolvedValue({ id: 1, creditBalance: 50 } as User);
      await expect(fixture.service.createManualTransaction(1, 2, 10.5)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows negative resulting balance when failOnInsufficientBalance is false', async () => {
      fixture.userRepository.findOneBy.mockResolvedValue({ id: 1, creditBalance: 10 } as User);
      fixture.billingTransactionRepository.save.mockResolvedValue({ id: 789 } as BillingTransaction);

      const result = await fixture.service.createManualTransaction(1, 2, -20, false);
      expect(fixture.billingTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, initiatorId: 2, amount: -20 }),
      );
      expect(result).toEqual({ id: 789 });
    });
  });
}

export function registerCreatesAnOppositeSignRefundForTransactionAmountSCases(
  fixture: ReturnType<typeof registerBillingServiceFixture>,
) {
  it.each([100, -100])('creates an opposite-sign refund for transaction amount %s', async (amount) => {
    const original = { id: 4, userId: 7, amount } as BillingTransaction;
    const refund = {
      id: 5,
      userId: 7,
      amount: amount > 0 ? -25 : 25,
      status: BillingTransactionStatus.Completed,
    } as BillingTransaction;
    jest.spyOn(fixture.service, 'getTransaction').mockResolvedValueOnce(original).mockResolvedValueOnce(refund);
    fixture.billingTransactionRepository.save.mockResolvedValue(refund);
    expect(await fixture.service.refundTransaction(9, 4, { amount: 25 })).toBe(refund);
    expect(fixture.billingTransactionRepository.save).toHaveBeenCalledWith({
      userId: 7,
      initiatorId: 9,
      amount: refund.amount,
      status: BillingTransactionStatus.Completed,
      refundOfId: 4,
    });
    expect(fixture.liveNotificationsService.notifyTransactionUpdate).toHaveBeenCalledWith(refund);
    expect(fixture.auditService.recordBillingTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 5, source: 'refund', amount: refund.amount }),
    );
  });
}

export function registerFindsOnlyTheOwnerSTransactionIdForAUsageSCases(
  fixture: ReturnType<typeof registerBillingServiceFixture>,
) {
  it.each([null, { id: 7 }])('finds only the owner’s transaction ID for a usage (%s)', async (transaction) => {
    fixture.billingTransactionRepository.findOne.mockResolvedValue(transaction);
    expect(await fixture.service.getTransactionIdForUsage(8, 2)).toBe(transaction?.id ?? null);
    expect(fixture.billingTransactionRepository.findOne).toHaveBeenCalledWith({
      where: { resourceUsageId: 8, userId: 2 },
      select: ['id'],
    });
  });
}

export function registerGetBalanceCases(fixture: ReturnType<typeof registerBillingServiceFixture>) {
  describe('getBalance', () => {
    it('returns creditBalance for existing user', async () => {
      const user = { id: 1, creditBalance: 42 } as User;
      fixture.userRepository.findOneBy.mockResolvedValue(user);

      await expect(fixture.service.getBalance(1)).resolves.toBe(42);
      expect(fixture.userRepository.findOneBy).toHaveBeenCalledWith({ id: 1 });
    });

    it('throws when user does not exist', async () => {
      fixture.userRepository.findOneBy.mockResolvedValue(null);

      await expect(fixture.service.getBalance(999)).rejects.toBeInstanceOf(UserNotFoundException);
    });
  });
}

export function registerGetHistoryCases(fixture: ReturnType<typeof registerBillingServiceFixture>) {
  describe('getHistory', () => {
    it('returns paginated transactions and calls repository with correct options', async () => {
      const transactions = [{ id: 10 } as BillingTransaction, { id: 9 } as BillingTransaction];
      fixture.billingTransactionRepository.findAndCount.mockResolvedValue([transactions, 2]);

      const result = await fixture.service.getHistory(7, { page: 2, limit: 10 });

      expect(result).toEqual({ data: transactions, total: 2, page: 2, limit: 10 });
      expect(fixture.billingTransactionRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 7 },
          skip: 10,
          take: 10,
          relations: expect.arrayContaining(['initiator', 'resourceUsage', 'resourceUsage.resource', 'refundOf']),
          order: { createdAt: 'DESC', id: 'DESC' },
        }),
      );
    });
  });
}
