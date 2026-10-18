import { ForbiddenException } from '@nestjs/common';
import { AttractapNfcCardsController } from './card.controller';

it('denies card-key export before reading the administrator or generating a key', async () => {
  // The key route must reject even direct calls, regardless of HTTP permissions.
  const controller = new AttractapNfcCardsController(null, null);
  await expect(controller.getAppKeyByUid({ keyNo: 1, cardUID: '04010203040506' }, null)).rejects.toEqual(
    new ForbiddenException('CARD_KEY_EXPORT_DISABLED'),
  );
});
