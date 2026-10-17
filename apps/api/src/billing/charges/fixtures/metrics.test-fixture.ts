export const mockMetricsService = {
  billingTransactionsTotal: { inc: jest.fn() },
  billingTransactionAmount: { observe: jest.fn() },
};
