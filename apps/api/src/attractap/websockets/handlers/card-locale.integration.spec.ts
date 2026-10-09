import { entities, NFCCard, Resource, ResourceType, User } from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import * as migrations from '../../../database/migrations';
import { UserProfileController } from '../../../users-and-auth/users/user-profile.controller';
import { UsersService } from '../../../users-and-auth/users/users.service';
import { AttractapService } from '../../attractap.service';
import { AuthenticatedWebSocket, AttractapEventType } from '../websocket.types';
import { AttractapCardHandler } from './card.handler';

describe('persisted web UI locale at card authentication', () => {
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

  it('delivers each saved language on the next tap without updating the card or reconnecting', async () => {
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
    const handler: AttractapCardHandler = Object.assign(new AttractapCardHandler(), {
      attractapService,
      resourceRepository,
      metricsService: { attractapNfcTapsTotal: { inc: jest.fn() } },
      resourceUsageService: { canControllResource: async () => true },
      resourceIntroducersService: { isIntroducer: async () => false },
      rbacService: { getEffectivePermissions: async () => new Set<string>() },
      resourceListService: { sendResourceListToSocket: async () => undefined },
    });
    const sendMessage = jest.fn().mockResolvedValue(true);
    const socket = { readerId: 42, state: {}, sendMessage } as unknown as AuthenticatedWebSocket;
    const tap = () =>
      handler.handleCardAuthenticationRequest(socket, {
        type: AttractapEventType.REQUEST_CARD_AUTHENTICATION_DATA,
        payload: { uid: card.uid, resourceId: resource.id },
      });
    const expectLanguage = (language: string) =>
      expect(sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.CARD_AUTHENTICATION_DATA,
            payload: expect.objectContaining({ username: user.username, language }),
          }),
        }),
      );

    await tap();
    expectLanguage('en');
    for (const [locale, language] of [
      ['de-DE', 'de'],
      ['en-GB', 'en'],
      ['fr-FR', 'en'],
    ]) {
      // The controller used by useLocaleSync receives the same, deliberately stale session user.
      const updated = await profile.updateMyLocale({ user } as never, { locale });
      expect(updated.locale).toBe(locale);
      expect((await userRepository.findOneByOrFail({ id: user.id })).locale).toBe(locale);
      await tap();
      expectLanguage(language);
    }
    expect(user.locale).toBe('en');
    expect((await userRepository.findOneByOrFail({ id: otherUser.id })).locale).toBe('en');
    expect(await cardRepository.count()).toBe(1);
  });
});
