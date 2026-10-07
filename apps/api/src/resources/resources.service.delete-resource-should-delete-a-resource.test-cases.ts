import { DeleteResourceTestScope } from './resources.service.spec';
export function registerDeleteResourceShouldDeleteAResource(scope: DeleteResourceTestScope): void {
  it('should delete a resource', async () => {
    (scope.resourceRepository.softDelete as jest.Mock).mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });

    await scope.service.deleteResource(1);

    expect(scope.resourceRepository.softDelete).toHaveBeenCalledWith(1);
  });
}
