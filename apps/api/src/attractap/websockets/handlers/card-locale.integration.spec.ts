import { entities, NFCCard, Resource, ResourceType, User } from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import * as migrations from '../../../database/migrations';
import { UserProfileController } from '../../../users-and-auth/users/user-profile.controller';
import { UsersService } from '../../../users-and-auth/users/users.service';
import { AttractapService } from '../../attractap.service';
import { AuthenticatedWebSocket, AttractapEventType } from '../websocket.types';
import { AttractapCardHandler } from './card/card.handler';

describe('persisted web UI locale at the card verification boundary', () => {
  let source: DataSource;

  beforeAll(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
      migrations: Object.values(migrations),
    }).initialize();
    await source.runMigrations();
  }, 60_000);

  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
  });

  it('retains saved languages without authorizing a card or exposing its keys', async () => {
    const userRepository = source.getRepository(User);
    const resourceRepository = source.getRepository(Resource);
    const cardRepository = source.getRepository(NFCCard);
    const user = await userRepository.save({ username: 'cardholder', email: 'cardholder@example.test', locale: 'en' });
    const otherUser = await userRepository.save({ username: 'other', email: 'other@example.test', locale: 'en' });
    const resource = await resourceRepository.save({ name: 'Lathe', type: ResourceType.Machine });
    const card = await cardRepository.save({
      uid: '04AABBCC',
      key: 'test-key',
      keyNo: 1,
      isActive: true,
      user,
    });

    // Keep production persistence and lookup methods; stub only unrelated collaborators.
    const usersService: UsersService = Object.assign(Object.create(UsersService.prototype), {
      userRepository,
      metricsService: {
        usersLocaleSyncsTotal: { inc: jest.fn() },
        usersPerLocale: { inc: jest.fn(), dec: jest.fn() },
      },
    });
    const profile = new UserProfileController(usersService);
    const attractapService: AttractapService = Object.assign(Object.create(AttractapService.prototype), {
      nfcCardRepository: cardRepository,
      encryptionService: { decryptIfEncrypted: (value: string) => value },
    });
    const handler = new AttractapCardHandler();
    const lookup = jest.spyOn(attractapService, 'getNFCCardByUID');
    Object.assign(handler, { attractapService });
    const sendMessage = jest.fn().mockResolvedValue(true);
    const socket = { readerId: 42, state: {}, sendMessage } as unknown as AuthenticatedWebSocket;
    const tap = () =>
      handler.handleCardAuthenticationRequest(socket, {
        type: AttractapEventType.REQUEST_CARD_AUTHENTICATION_DATA,
        payload: { uid: card.uid, resourceId: resource.id },
      });
    const expectDenied = () => {
      expect(sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.CARD_AUTHENTICATION_DATA,
            payload: { error: 'CARD_VERIFICATION_UNAVAILABLE' },
          }),
        }),
      );
      expect(socket.state.lastAuthenticatedUserId).toBeNull();
      expect(lookup).not.toHaveBeenCalled();
    };

    await tap();
    expectDenied();
    for (const locale of ['de-DE', 'en-GB', 'fr-FR', 'en-!!!']) {
      // Locale persistence remains independent of the deferred card gateway.
      const updated = await profile.updateMyLocale({ user } as never, { locale });
      expect(updated.locale).toBe(locale);
      expect((await userRepository.findOneByOrFail({ id: user.id })).locale).toBe(locale);
      await tap();
      expectDenied();
    }
    expect(user.locale).toBe('en');
    expect((await userRepository.findOneByOrFail({ id: otherUser.id })).locale).toBe('en');
    expect(await cardRepository.count()).toBe(1);
  });
});
