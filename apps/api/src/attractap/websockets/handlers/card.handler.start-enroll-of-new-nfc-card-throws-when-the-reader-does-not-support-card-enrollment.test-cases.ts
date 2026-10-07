import { StartEnrollOfNewNfcCardTestScope } from './card.handler.spec';
export function registerStartEnrollOfNewNfcCardThrowsWhenTheReaderDoesNotSupportCardEnrollment(
  scope: StartEnrollOfNewNfcCardTestScope,
): void {
  it('throws when the reader does not support card enrollment', async () => {
    scope.attractapService.findReaderById.mockResolvedValueOnce({
      id: 42,
      firmware: { capabilities: { cardEnrollment: false } },
    });

    await expect(scope.handler.startEnrollOfNewNfcCard({ readerId: 42, userId: 1 })).rejects.toThrow(
      'Reader does not support card enrollment: 42',
    );
  });
}
