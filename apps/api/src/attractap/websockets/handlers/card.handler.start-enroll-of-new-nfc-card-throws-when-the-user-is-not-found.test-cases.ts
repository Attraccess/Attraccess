import { StartEnrollOfNewNfcCardTestScope } from './card.handler.spec';
export function registerStartEnrollOfNewNfcCardThrowsWhenTheUserIsNotFound(
  scope: StartEnrollOfNewNfcCardTestScope,
): void {
  it('throws when the user is not found', async () => {
    scope.usersService.findOne.mockResolvedValueOnce(null);

    await expect(scope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 })).rejects.toThrow(
      'User not found: 1',
    );
  });
}
