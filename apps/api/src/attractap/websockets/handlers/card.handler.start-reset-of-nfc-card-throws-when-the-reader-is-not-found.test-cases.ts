import { StartResetOfNfcCardTestScope } from './card.handler.spec';
export function registerStartResetOfNfcCardThrowsWhenTheReaderIsNotFound(scope: StartResetOfNfcCardTestScope): void {
  it('throws when the reader is not found', async () => {
    scope.attractapService.findReaderById.mockResolvedValueOnce(null);

    await expect(scope.handler.startResetOfNfcCard({ readerId: 42, userId: 1, cardId: 7 })).rejects.toThrow(
      'Reader not found: 42',
    );
  });
}
