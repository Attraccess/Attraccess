import { BillingServiceTestScope } from './billing.service.spec';
export function registerBillingServiceShouldBeDefined(scope: BillingServiceTestScope): void {
  it('should be defined', () => {
    expect(scope.service).toBeDefined();
  });
}
