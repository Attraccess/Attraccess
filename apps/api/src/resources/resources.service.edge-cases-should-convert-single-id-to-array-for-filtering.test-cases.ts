import { EdgeCasesTestScope } from './resources.service.spec';
export function registerEdgeCasesShouldConvertSingleIdToArrayForFiltering(scope: EdgeCasesTestScope): void {
  it('should convert single ID to array for filtering', async () => {
    await scope.parentScope.service.listResources({ ids: 42 });

    expect(scope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', { ids: [42] });
  });
}
