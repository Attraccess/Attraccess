import { BasicFunctionalityTestScope } from './resources.service.spec';
export function registerBasicFunctionalityShouldReturnEmptyResults(scope: BasicFunctionalityTestScope): void {
  it('should return empty results', async () => {
    scope.mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

    const result = await scope.parentScope.service.listResources();

    expect(result.data).toEqual([]);
    expect(result.total).toEqual(0);
  });
}
