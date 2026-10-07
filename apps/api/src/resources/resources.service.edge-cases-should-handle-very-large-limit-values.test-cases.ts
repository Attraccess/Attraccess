import { EdgeCasesTestScope } from './resources.service.spec';
export function registerEdgeCasesShouldHandleVeryLargeLimitValues(scope: EdgeCasesTestScope): void {
  it('should handle very large limit values', async () => {
    await scope.parentScope.service.listResources({ limit: 1000 });

    expect(scope.mockQueryBuilder.take).toHaveBeenCalledWith(1000);
  });
}
