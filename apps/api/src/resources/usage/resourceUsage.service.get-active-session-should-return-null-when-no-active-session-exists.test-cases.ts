import { GetActiveSessionTestScope } from './resourceUsage.service.spec';
export function registerGetActiveSessionShouldReturnNullWhenNoActiveSessionExists(
  scope: GetActiveSessionTestScope,
): void {
  it('should return null when no active session exists', async () => {
    scope.resourceUsageRepository.findOne.mockResolvedValue(null);

    const result = await scope.service.getActiveSession(1);

    expect(result).toBeNull();
  });
}
