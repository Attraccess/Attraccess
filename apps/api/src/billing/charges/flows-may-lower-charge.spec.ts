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
});
