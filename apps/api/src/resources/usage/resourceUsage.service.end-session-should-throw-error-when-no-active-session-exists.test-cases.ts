import { BadRequestException } from '@nestjs/common';
import { EndUsageSessionDto } from './dtos/endUsageSession.dto';
import { EndSessionTestScope } from './resourceUsage.service.spec';
export function registerEndSessionShouldThrowErrorWhenNoActiveSessionExists(scope: EndSessionTestScope): void {
  it('should throw error when no active session exists', async () => {
    const dto: EndUsageSessionDto = { notes: 'Session completed' };

    // Mock getActiveSession to return null (no active session)
    scope.resourceUsageRepository.findOne.mockResolvedValue(null);

    await expect(scope.service.endSession(1, scope.mockUser, dto)).rejects.toThrow(
      new BadRequestException('No active session found'),
    );
  });
}
