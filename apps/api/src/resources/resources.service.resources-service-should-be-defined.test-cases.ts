import { ResourcesServiceTestScope } from './resources.service.spec';
export function registerResourcesServiceShouldBeDefined(scope: ResourcesServiceTestScope): void {
  it('should be defined', () => {
    expect(scope.service).toBeDefined();
  });
}
