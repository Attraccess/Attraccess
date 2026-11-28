import { BillingService } from '../billing.service';
import type { BillableUsage } from '../billable-usage';
import {
  FakeBillingConfigurationStore,
  FakeBillingLedgerStore,
  FakeUnitOfWork,
} from '../../testing/billing-store.fakes';

/** A BillingService on in-memory stores; the collaborators outside billing are mocks. */
export function createBillingServiceFixture() {
  const ledgerStore = new FakeBillingLedgerStore();
  const configurationStore = new FakeBillingConfigurationStore();
  const unitOfWork = new FakeUnitOfWork();
  const liveNotifications = {
    notifyTransactionUpdate: jest.fn().mockResolvedValue(undefined),
    notifyTransactionRemoved: jest.fn(),
  };
  const email = { sendResourceUsageBillingSummaryEmail: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const metrics = {
    billingTransactionsTotal: { inc: jest.fn() },
    billingTransactionAmount: { observe: jest.fn() },
  };
  const events = { emit: jest.fn() };
  const flows = {
    getNodes: jest.fn().mockResolvedValue([]),
    getGlobalNodesOfFlowsWith: jest.fn().mockResolvedValue([]),
  };
  const service = new BillingService(
    ledgerStore,
    configurationStore,
    liveNotifications as never,
    flows as never,
    email as never,
    events as never,
    metrics as never,
    audit as never,
    unitOfWork,
  );
  return {
    service,
    ledgerStore,
    configurationStore,
    unitOfWork,
    liveNotifications,
    email,
    audit,
    metrics,
    events,
    flows,
  };
}

/** An ended one-minute session of user 25 on resource 205 with every price zero unless overridden. */
export function billableUsage(overrides: Partial<BillableUsage> = {}): BillableUsage {
  return {
    id: 22,
    userId: 25,
    startTime: new Date('2026-09-20T09:00:00.000Z'),
    endTime: new Date('2026-09-20T09:01:00.000Z'),
    resource: { id: 205 },
    user: { billingFactor: 100 },
    sessionDurationCreditsPerMinute: 0,
    operatingDurationCreditsPerMinute: 0,
    creditsPerUsage: 0,
    billingFactor: null,
    ...overrides,
  };
}
