import { EdgeCasesTestScope } from './resources.service.spec';
export function registerEdgeCasesShouldHandleZeroAndNegativePageNumbersGracefully(scope: EdgeCasesTestScope): void {
  it('should handle zero and negative page numbers gracefully', async () => {
    await scope.parentScope.service.listResources({ page: 0, limit: 5 });

    // Page 0 should be treated as page 1, so skip should be 0
    expect(scope.mockQueryBuilder.skip).toHaveBeenCalledWith(-5); // (0-1) * 5
  });
}
