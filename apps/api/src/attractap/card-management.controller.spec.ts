import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthenticatedRequest, DualAuthGuard } from '@attraccess/plugins-backend-sdk';
import type { AttractapNfcCard, PluginUserModel } from '@attraccess/application-models';
import request from 'supertest';
import { ResourceListVisibilityService } from '../resources/visibility/resource-list-visibility.service';
import { AttractapController } from './attractap.controller';
import { AttractapNfcCardsController } from './card.controller';
import { CardAccessService } from './card-access.service';
import { CardOperationsService } from './websockets/card-operations.service';
import { AttractapService } from './attractap.service';
import { AttractapGateway } from './websockets/websocket.gateway';
import { WebsocketService } from './websockets/websocket.service';
import { UsersService } from '../users-and-auth/users/users.service';
import { LicenseGuard } from '../license/license.guard';

describe('RFID card management authorization', () => {
  let app: INestApplication;
  const card = {
    id: 7,
    uid: '04aabbcc',
    user: { id: 2 },
    key: 'secret',
    keyNo: 1,
    isActive: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    lastSeen: new Date(0),
  } as unknown as AttractapNfcCard;
  const service = {
    getNFCCardByID: jest.fn(),
    getNFCCardsByUserId: jest.fn().mockResolvedValue([card]),
    // TypeORM save can return a plain object; serialization must still hide key material.
    activateNFCCard: jest.fn().mockResolvedValue({ ...card }),
    deactivateNFCCard: jest.fn().mockResolvedValue(card),
  };
  const gateway = { startEnrollOfNewNfcCard: jest.fn(), startResetOfNfcCard: jest.fn() };
  const users = { findOne: jest.fn() };
  const operations = { deleteUidOnlyCard: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AttractapController, AttractapNfcCardsController],
      providers: [
        CardAccessService,
        { provide: AttractapService, useValue: service },
        { provide: AttractapGateway, useValue: gateway },
        { provide: WebsocketService, useValue: {} },
        { provide: UsersService, useValue: users },
        { provide: CardOperationsService, useValue: operations },
        { provide: ResourceListVisibilityService, useValue: {} },
      ],
    })
      .overrideGuard(LicenseGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(DualAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
          req.user = Object.assign({} as PluginUserModel, {
            id: Number(req.headers['actor-id'] ?? 1),
            jwtTokenId: 'test',
            authenticationMethod: 'api-token',
            apiTokenId: 9,
            effectivePermissions: new Set(String(req.headers['permissions'] ?? '').split(',')),
          });
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service.getNFCCardByID.mockResolvedValue(card);
    users.findOne.mockResolvedValue({ id: 2 });
  });
  afterAll(async () => app.close());

  it('keeps listing and enrollment defaulting to yourself without an elevated permission', async () => {
    await request(app.getHttpServer()).get('/attractap/cards').expect(200);
    expect(service.getNFCCardsByUserId).toHaveBeenCalledWith(1);
    await request(app.getHttpServer()).post('/attractap/readers/enroll-nfc-card').send({ readerId: 4 }).expect(201);
    expect(gateway.startEnrollOfNewNfcCard).toHaveBeenCalledWith({
      readerId: 4,
      userId: 1,
      actorId: 1,
      authenticationMethod: 'api-token',
      apiTokenId: 9,
    });
    await request(app.getHttpServer())
      .post('/attractap/readers/enroll-nfc-card')
      .set('actor-id', '3')
      .send({ readerId: 4, userId: null })
      .expect(201);
    expect(gateway.startEnrollOfNewNfcCard).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId: 3, actorId: 3 }),
    );
  });

  it.each(['', 'users.update', 'users.read'])(
    'rejects cross-user operations with permissions "%s"',
    async (permissions) => {
      await request(app.getHttpServer()).get('/attractap/cards?userId=2').set('permissions', permissions).expect(403);
      await request(app.getHttpServer())
        .post('/attractap/readers/enroll-nfc-card')
        .set('permissions', permissions)
        .send({ readerId: 4, userId: 2 })
        .expect(403);
      await request(app.getHttpServer())
        .post('/attractap/readers/reset-nfc-card')
        .set('permissions', permissions)
        .send({ readerId: 4, cardId: 7 })
        .expect(403);
      await request(app.getHttpServer())
        .patch('/attractap/cards/7/active')
        .set('permissions', permissions)
        .send({ active: true })
        .expect(403);
      expect(gateway.startEnrollOfNewNfcCard).not.toHaveBeenCalled();
      expect(gateway.startResetOfNfcCard).not.toHaveBeenCalled();
      expect(service.activateNFCCard).not.toHaveBeenCalled();
    },
  );

  it.each(['owner', 'manager'])('allows activation, deactivation and reset by the %s', async (actor) => {
    const actorId = actor === 'owner' ? '2' : '1';
    const permissions = actor === 'manager' ? 'users.rfid-cards.manage' : '';
    for (const active of [true, false]) {
      const response = await request(app.getHttpServer())
        .patch('/attractap/cards/7/active')
        .set('actor-id', actorId)
        .set('permissions', permissions)
        .send({ active })
        .expect(200);
      expect(response.body.key).toBeUndefined();
      expect(response.body.keyNo).toBeUndefined();
    }
    expect(service.activateNFCCard).toHaveBeenCalledWith(7);
    expect(service.deactivateNFCCard).toHaveBeenCalledWith(7);
    await request(app.getHttpServer())
      .post('/attractap/readers/reset-nfc-card')
      .set('actor-id', actorId)
      .set('permissions', permissions)
      .send({ readerId: 4, cardId: 7 })
      .expect(201);
    expect(gateway.startResetOfNfcCard).toHaveBeenCalledWith({
      readerId: 4,
      cardId: 7,
      userId: Number(actorId),
      authenticationMethod: 'api-token',
      apiTokenId: 9,
    });
  });

  it('allows the dedicated permission to list and enroll for another user while preserving the actor', async () => {
    const response = await request(app.getHttpServer())
      .get('/attractap/cards?userId=2')
      .set('permissions', 'users.rfid-cards.manage')
      .expect(200);
    expect(service.getNFCCardsByUserId).toHaveBeenCalledWith(2);
    expect(response.body[0].key).toBeUndefined();
    await request(app.getHttpServer())
      .post('/attractap/readers/enroll-nfc-card')
      .set('permissions', 'users.rfid-cards.manage')
      .send({ readerId: 4, userId: 2 })
      .expect(201);
    expect(gateway.startEnrollOfNewNfcCard).toHaveBeenCalledWith({
      readerId: 4,
      userId: 2,
      actorId: 1,
      authenticationMethod: 'api-token',
      apiTokenId: 9,
    });
  });

  it('returns 404 for missing targets and cards before starting an operation', async () => {
    users.findOne.mockResolvedValue(null);
    service.getNFCCardByID.mockResolvedValue(undefined);
    await request(app.getHttpServer())
      .get('/attractap/cards?userId=2')
      .set('permissions', 'users.rfid-cards.manage')
      .expect(404);
    await request(app.getHttpServer())
      .post('/attractap/readers/enroll-nfc-card')
      .set('permissions', 'users.rfid-cards.manage')
      .send({ readerId: 4, userId: 2 })
      .expect(404);
    await request(app.getHttpServer()).patch('/attractap/cards/7/active').send({ active: true }).expect(404);
    await request(app.getHttpServer())
      .post('/attractap/readers/reset-nfc-card')
      .send({ readerId: 4, cardId: 7 })
      .expect(404);
    expect(gateway.startEnrollOfNewNfcCard).not.toHaveBeenCalled();
    expect(gateway.startResetOfNfcCard).not.toHaveBeenCalled();
  });

  it('rejects malformed owner and card IDs', async () => {
    await request(app.getHttpServer()).get('/attractap/cards?userId=abc').expect(400);
    await request(app.getHttpServer()).patch('/attractap/cards/abc/active').send({ active: true }).expect(400);
    await request(app.getHttpServer())
      .post('/attractap/readers/enroll-nfc-card')
      .send({ readerId: 4, userId: 1.5 })
      .expect(400);
  });

  describe('DELETE /attractap/cards/:id (UID-only cards)', () => {
    const uidOnly = { ...card, type: 'uid-only', key: null, keyNo: null } as unknown as AttractapNfcCard;

    beforeEach(() => operations.deleteUidOnlyCard.mockResolvedValue({ ok: true }));

    it.each(['owner', 'manager'])('lets the %s delete a UID-only card and audits it as the actor', async (actor) => {
      service.getNFCCardByID.mockResolvedValue(uidOnly);
      await request(app.getHttpServer())
        .delete('/attractap/cards/7')
        .set('actor-id', actor === 'owner' ? '2' : '1')
        .set('permissions', actor === 'manager' ? 'users.rfid-cards.manage' : '')
        .expect(204);
      expect(operations.deleteUidOnlyCard).toHaveBeenCalledWith(uidOnly, {
        userId: actor === 'owner' ? 2 : 1,
        authenticationMethod: 'api-token',
        apiTokenId: 9,
      });
    });

    it("refuses another user's card without the manage permission", async () => {
      service.getNFCCardByID.mockResolvedValue(uidOnly);
      await request(app.getHttpServer()).delete('/attractap/cards/7').set('permissions', '').expect(403);
      expect(operations.deleteUidOnlyCard).not.toHaveBeenCalled();
    });

    it('refuses a secure card: it is reset through a reader', async () => {
      service.getNFCCardByID.mockResolvedValue({ ...card, type: 'aes' });
      operations.deleteUidOnlyCard.mockResolvedValue({ ok: false, error: 'CARD_NOT_UID_ONLY' });
      const response = await request(app.getHttpServer()).delete('/attractap/cards/7').set('actor-id', '2').expect(400);
      expect(response.body.message).toBe('CARD_NOT_UID_ONLY');
    });

    it('returns 404 when the card was deleted in the meantime', async () => {
      service.getNFCCardByID.mockResolvedValue(uidOnly);
      operations.deleteUidOnlyCard.mockResolvedValue({ ok: false, error: 'CARD_NOT_FOUND' });
      await request(app.getHttpServer()).delete('/attractap/cards/7').set('actor-id', '2').expect(404);
    });

    it('returns 404 for a missing card', async () => {
      service.getNFCCardByID.mockResolvedValue(undefined);
      await request(app.getHttpServer()).delete('/attractap/cards/7').expect(404);
    });
  });

  it('exposes the card type and never the key', async () => {
    service.getNFCCardsByUserId.mockResolvedValueOnce([{ ...card, type: 'uid-only', key: null, keyNo: null }]);
    const response = await request(app.getHttpServer()).get('/attractap/cards').expect(200);
    expect(response.body[0]).toMatchObject({ id: 7, type: 'uid-only' });
    expect(response.body[0].key).toBeUndefined();
    expect(response.body[0].keyNo).toBeUndefined();
  });
});
