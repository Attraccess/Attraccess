import { EdgeCasesTestScope } from './resources.service.spec';
export function registerEdgeCasesShouldHandleNullUndefinedOptionsGracefully(scope: EdgeCasesTestScope): void {
  it('should handle null/undefined options gracefully', async () => {
    const result = await scope.parentScope.service.listResources(undefined);

    expect(result.page).toEqual(1);
    expect(result.limit).toEqual(10);
    expect(scope.mockQueryBuilder.skip).toHaveBeenCalledWith(0);
    expect(scope.mockQueryBuilder.take).toHaveBeenCalledWith(10);
  });
}
