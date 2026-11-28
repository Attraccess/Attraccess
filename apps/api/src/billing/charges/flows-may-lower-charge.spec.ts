import { ResourceFlowNodeType } from '@attraccess/application-models';
import { createBillingServiceFixture } from './fixtures/billing-service.test-fixture';

describe('BillingService.flowsMayLowerCharge', () => {
  const items = (...unitPrices: number[]) => unitPrices.map((unitPrice) => ({ data: { unitPrice } }));

  it.each([
    [[], false],
    [[0, 150], false],
    [[150, -1], true],
  ])('with billing item prices %j answers %s', async (unitPrices, expected) => {
    const { service, flows } = createBillingServiceFixture();
    flows.getNodes.mockResolvedValue(items(...unitPrices));

    await expect(service.flowsMayLowerCharge(205)).resolves.toBe(expected);
    expect(flows.getNodes).toHaveBeenCalledWith(
      205,
      ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS,
      undefined,
    );
  });

  it('reads the price as the billing item schema does and skips a node without one', async () => {
    const { service, flows } = createBillingServiceFixture();
    flows.getNodes.mockResolvedValue([{ data: null }, { data: { name: 'Rebate' } }, { data: { unitPrice: 'x' } }]);
    await expect(service.flowsMayLowerCharge(205)).resolves.toBe(false);

    // Only the price counts: a node whose quantity comes from its input still lowers the charge.
    flows.getGlobalNodesOfFlowsWith.mockResolvedValue([{ data: { unitPrice: -2 } }]);
    await expect(service.flowsMayLowerCharge(205)).resolves.toBe(true);
  });
});
