import { StartEnrollOfNewNfcCardTestScope } from './card.handler.spec';
export function registerStartEnrollOfNewNfcCardThrowsWhenTheReaderIsNotFound(
  scope: StartEnrollOfNewNfcCardTestScope,
): void {
  it('throws when the reader is not found', async () => {
    scope.attractapService.findReaderById.mockResolvedValueOnce(null);

    await expect(scope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 })).rejects.toThrow(
      'Reader not found: 42',
    );
  });
}
