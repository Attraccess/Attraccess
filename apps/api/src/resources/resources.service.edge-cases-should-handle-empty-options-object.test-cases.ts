import { EdgeCasesTestScope } from './resources.service.spec';
export function registerEdgeCasesShouldHandleEmptyOptionsObject(scope: EdgeCasesTestScope): void {
  it('should handle empty options object', async () => {
    const result = await scope.parentScope.service.listResources({});

    expect(result.page).toEqual(1);
    expect(result.limit).toEqual(10);
  });
}
