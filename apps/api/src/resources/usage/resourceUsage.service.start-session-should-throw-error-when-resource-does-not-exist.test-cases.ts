import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';
import { StartSessionTestScope } from './resourceUsage.service.spec';
export function registerStartSessionShouldThrowErrorWhenResourceDoesNotExist(scope: StartSessionTestScope): void {
  it('should throw error when resource does not exist', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session' };

    // Mock resourceRepository.findOne to return null (resource not found)
    scope.resourceRepository.findOne.mockResolvedValue(null);

    await expect(scope.service.startSession(1, scope.mockUser, dto)).rejects.toThrow(ResourceNotFoundException);
  });
}
