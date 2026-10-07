import { StartResetOfNfcCardTestScope } from './card.handler.spec';
export function registerStartResetOfNfcCardThrowsWhenTheUserIsNotFound(scope: StartResetOfNfcCardTestScope): void {
  it('throws when the user is not found', async () => {
    scope.usersService.findOne.mockResolvedValueOnce(null);

    await expect(scope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 })).rejects.toThrow(
      'User not found: 1',
    );
  });
}
