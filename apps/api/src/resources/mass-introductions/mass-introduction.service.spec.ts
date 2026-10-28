import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Resource, ResourceGroup } from '@attraccess/database-entities';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { ResourceIntroductionsService } from '../introductions/resouceIntroductions.service';
import { ResourceIntroducersService } from '../introducers/resourceIntroducers.service';
import { ResourceGroupsIntroductionsService } from '../groups/introductions/resourceGroups.introductions.service';
import { ResourceGroupsIntroducersService } from '../groups/introducers/resourceGroups.introducers.service';
import { MassIntroductionLiveService } from './mass-introduction-live.service';
import { MassIntroductionService } from './mass-introduction.service';
import { MassIntroductionReaderPort } from './mass-introduction.types';
import { MassIntroductionEndReason, MassIntroductionLiveEventType } from './dtos/massIntroductionLiveEvent.dto';
import {
  MassIntroductionMethod,
  MassIntroductionReaderState,
  MassIntroductionTargetType,
} from './dtos/massIntroductionSession.dto';

describe('MassIntroductionService', () => {
  let service: MassIntroductionService;
  let resourceIntroductions: { hasValidIntroduction: jest.Mock; grant: jest.Mock };
  let resourceIntroducers: { isIntroducer: jest.Mock };
  let groupIntroductions: { hasValidIntroduction: jest.Mock; grant: jest.Mock };
  let groupIntroducers: { isIntroducer: jest.Mock };
  let live: { emitToIntroducer: jest.Mock };
  let readerPort: { arm: jest.Mock; disarm: jest.Mock };

  const introducer = {
    id: 1,
    username: 'tutor',
    authenticationMethod: 'session',
    effectivePermissions: new Set<string>(),
  } as unknown as AuthenticatedUser;
  const admin = {
    id: 9,
    username: 'admin',
    authenticationMethod: 'session',
    effectivePermissions: new Set(['resources.access.manage']),
  } as unknown as AuthenticatedUser;
  const alice = { id: 7, username: 'alice' };
  const bob = { id: 8, username: 'bob' };

  /** Scan the QR code shown right now, then redeem the ticket as the signed-in participant. */
  const scan = (session: { token: string }, user: { id: number; username: string }) =>
    Promise.resolve().then(() => service.redeemTicket(service.claim(session.token).ticket, user));

  const eventsOfType = (type: MassIntroductionLiveEventType) =>
    live.emitToIntroducer.mock.calls
      .filter(([, event]) => event.type === type)
      .map(([userId, event]) => ({
        userId,
        ...event,
      }));

  beforeEach(async () => {
    resourceIntroductions = {
      hasValidIntroduction: jest.fn().mockResolvedValue(false),
      grant: jest.fn().mockResolvedValue({}),
    };
    resourceIntroducers = { isIntroducer: jest.fn().mockResolvedValue(true) };
    groupIntroductions = {
      hasValidIntroduction: jest.fn().mockResolvedValue(false),
      grant: jest.fn().mockResolvedValue({}),
    };
    groupIntroducers = { isIntroducer: jest.fn().mockResolvedValue(true) };
    live = { emitToIntroducer: jest.fn() };
    readerPort = { arm: jest.fn().mockResolvedValue({ readerName: 'Entrance' }), disarm: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        MassIntroductionService,
        { provide: ResourceIntroductionsService, useValue: resourceIntroductions },
        { provide: ResourceIntroducersService, useValue: resourceIntroducers },
        { provide: ResourceGroupsIntroductionsService, useValue: groupIntroductions },
        { provide: ResourceGroupsIntroducersService, useValue: groupIntroducers },
        { provide: MassIntroductionLiveService, useValue: live },
        {
          provide: getRepositoryToken(Resource),
          useValue: { findOne: jest.fn(({ where }) => Promise.resolve({ id: where.id, name: 'Laser' })) },
        },
        {
          provide: getRepositoryToken(ResourceGroup),
          useValue: { findOne: jest.fn(({ where }) => Promise.resolve({ id: where.id, name: 'Wood shop' })) },
        },
      ],
    }).compile();

    service = module.get(MassIntroductionService);
    service.setReaderPort(readerPort as MassIntroductionReaderPort);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('requires exactly one target', async () => {
    await expect(service.start(introducer, {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.start(introducer, { resourceId: 1, resourceGroupId: 2 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('only lets introducers or access managers start a session', async () => {
    resourceIntroducers.isIntroducer.mockResolvedValue(false);
    await expect(service.start(introducer, { resourceId: 5 })).rejects.toBeInstanceOf(ForbiddenException);

    const session = await service.start(admin, { resourceId: 5 });
    expect(session.target).toEqual({ type: MassIntroductionTargetType.RESOURCE, id: 5, name: 'Laser' });
  });

  it('introduces QR participants on behalf of the introducer and reports them live', async () => {
    const session = await service.start(introducer, { resourceId: 5 });

    const result = await scan(session, alice);

    expect(result).toEqual({
      target: { type: MassIntroductionTargetType.RESOURCE, id: 5, name: 'Laser' },
      alreadyIntroduced: false,
    });
    expect(resourceIntroductions.grant).toHaveBeenCalledWith(5, alice.id, undefined, {
      tutorUserId: introducer.id,
      performedByUserId: introducer.id,
      authenticationMethod: 'session',
      apiTokenId: null,
    });
    const [update] = eventsOfType(MassIntroductionLiveEventType.UPDATED);
    expect(update.userId).toBe(introducer.id);
    expect(update.session.participants).toEqual([
      expect.objectContaining({ userId: alice.id, username: 'alice', method: MassIntroductionMethod.QR }),
    ]);
    expect(service.get(session.id, introducer.id).participants).toHaveLength(1);
  });

  it('grants once per participant, even for concurrent scans', async () => {
    const session = await service.start(introducer, { resourceId: 5 });

    await Promise.all([scan(session, alice), scan(session, alice)]);
    await scan(session, alice);

    expect(resourceIntroductions.grant).toHaveBeenCalledTimes(1);
    expect(eventsOfType(MassIntroductionLiveEventType.UPDATED)).toHaveLength(1);
  });

  it('records already-introduced participants without granting again', async () => {
    resourceIntroductions.hasValidIntroduction.mockResolvedValue(true);
    const session = await service.start(introducer, { resourceId: 5 });

    const result = await scan(session, alice);

    expect(result.alreadyIntroduced).toBe(true);
    expect(resourceIntroductions.grant).not.toHaveBeenCalled();
    expect(service.get(session.id, introducer.id).participants[0].alreadyIntroduced).toBe(true);
  });

  it('uses the group services for resource-group sessions', async () => {
    const session = await service.start(introducer, { resourceGroupId: 3 });
    await scan(session, alice);

    expect(groupIntroducers.isIntroducer).toHaveBeenCalledWith({ groupId: 3, userId: introducer.id });
    expect(groupIntroductions.grant).toHaveBeenCalledWith(3, alice.id, undefined, expect.any(Object));
    expect(resourceIntroductions.grant).not.toHaveBeenCalled();
  });

  it('rejects unknown codes and tickets', async () => {
    expect(() => service.claim('not-a-token')).toThrow(NotFoundException);
    await expect(service.redeemTicket('not.a-ticket', alice)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('expires after 15 minutes: the token stops working and the reader is released', async () => {
    jest.useFakeTimers();
    const session = await service.start(introducer, { resourceId: 5, readerId: 3 });

    jest.advanceTimersByTime(MassIntroductionService.TTL_MS);

    await expect(scan(session, alice)).rejects.toBeInstanceOf(NotFoundException);
    expect(readerPort.disarm).toHaveBeenCalledWith({
      readerId: 3,
      sessionId: session.id,
      reason: MassIntroductionEndReason.EXPIRED,
    });
    expect(eventsOfType(MassIntroductionLiveEventType.ENDED)).toEqual([
      expect.objectContaining({ sessionId: session.id, reason: MassIntroductionEndReason.EXPIRED }),
    ]);
  });

  it('lets only the owner read or cancel a session', async () => {
    const session = await service.start(introducer, { resourceId: 5, readerId: 3 });

    expect(() => service.get(session.id, admin.id)).toThrow(NotFoundException);
    expect(() => service.cancel(session.id, admin.id)).toThrow(NotFoundException);

    service.cancel(session.id, introducer.id);

    expect(readerPort.disarm).toHaveBeenCalledWith(
      expect.objectContaining({ readerId: 3, reason: MassIntroductionEndReason.CANCELLED }),
    );
    await expect(scan(session, alice)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('fails fast and leaves no session behind when the reader cannot be armed', async () => {
    readerPort.arm.mockRejectedValue(new ConflictException('busy'));

    await expect(service.start(introducer, { resourceId: 5, readerId: 3 })).rejects.toBeInstanceOf(ConflictException);

    expect(live.emitToIntroducer).not.toHaveBeenCalled();
    // Starting again works, so nothing was left registered.
    readerPort.arm.mockResolvedValue({ readerName: 'Entrance' });
    await expect(service.start(introducer, { resourceId: 5, readerId: 3 })).resolves.toBeDefined();
  });

  it('replaces an earlier session of the same introducer for the same target', async () => {
    const first = await service.start(introducer, { resourceId: 5 });
    const second = await service.start(introducer, { resourceId: 5 });

    await expect(scan(first, alice)).rejects.toBeInstanceOf(NotFoundException);
    await expect(scan(second, alice)).resolves.toBeDefined();
  });

  it('ends the session when the introducer has lost the introducer role', async () => {
    const session = await service.start(introducer, { resourceId: 5 });
    resourceIntroducers.isIntroducer.mockResolvedValue(false);

    await expect(scan(session, alice)).rejects.toBeInstanceOf(ForbiddenException);

    expect(resourceIntroductions.grant).not.toHaveBeenCalled();
    expect(eventsOfType(MassIntroductionLiveEventType.ENDED)[0].reason).toBe(MassIntroductionEndReason.REVOKED);
  });

  it('introduces card holders only through the armed reader', async () => {
    const session = await service.start(introducer, { resourceId: 5, readerId: 3 });

    await expect(service.redeemCard(session.id, 4, alice)).rejects.toBeInstanceOf(NotFoundException);
    const { participant, participantCount } = await service.redeemCard(session.id, 3, alice);
    await scan(session, bob);

    expect(participant.method).toBe(MassIntroductionMethod.NFC);
    expect(participantCount).toBe(1);
    expect(service.get(session.id, introducer.id).participants.map((p) => p.username)).toEqual(['alice', 'bob']);
  });

  it('keeps the QR code working after the reader detaches', async () => {
    const session = await service.start(introducer, { resourceId: 5, readerId: 3 });

    service.detachReader(session.id, 3);

    expect(service.get(session.id, introducer.id).reader?.state).toBe(MassIntroductionReaderState.DETACHED);
    await expect(service.redeemCard(session.id, 3, alice)).rejects.toBeInstanceOf(NotFoundException);
    await expect(scan(session, alice)).resolves.toBeDefined();

    service.cancel(session.id, introducer.id);
    expect(readerPort.disarm).not.toHaveBeenCalled();
  });

  describe('rotating QR codes', () => {
    const PERIOD_MS = 15_000;

    it('changes the code every 15 seconds and accepts it until the next change', async () => {
      const session = await service.start(introducer, { resourceId: 5 });
      const shownAt = Date.now();

      expect(new Date(session.tokenRefreshAt).getTime() - shownAt).toBeLessThanOrEqual(PERIOD_MS);
      const later = service.get(session.id, introducer.id);
      expect(later.token.split('.')[0]).toBe(session.token.split('.')[0]);

      // Still valid one period later (a scan just before the change), no longer two periods later.
      expect(() => service.claim(session.token, shownAt + PERIOD_MS)).not.toThrow();
      expect(() => service.claim(session.token, shownAt + 2 * PERIOD_MS + 1000)).toThrow(NotFoundException);
    });

    it('rejects a code with a wrong number', async () => {
      const session = await service.start(introducer, { resourceId: 5 });
      const [publicId, code] = session.token.split('.');
      const wrong = String((Number(code) + 1) % 100_000_000).padStart(8, '0');

      expect(() => service.claim(`${publicId}.${wrong}`)).toThrow(NotFoundException);
      expect(() => service.claim(publicId)).toThrow(NotFoundException);
    });

    it('stops accepting guesses after too many invalid codes in a minute', async () => {
      jest.useFakeTimers();
      const session = await service.start(introducer, { resourceId: 5 });
      const [publicId] = session.token.split('.');
      for (let i = 0; i < MassIntroductionService.MAX_FAILED_CLAIMS_PER_MINUTE; i++) {
        expect(() => service.claim(`${publicId}.00000000`)).toThrow(NotFoundException);
      }

      expect(() => service.claim(session.token)).toThrow(expect.objectContaining({ status: 429 }));

      jest.setSystemTime(Date.now() + 60_000);
      expect(() => service.claim(service.get(session.id, introducer.id).token)).not.toThrow();
    });

    it('lets a ticket outlive the code for a sign-in, but only once and not forever', async () => {
      const session = await service.start(introducer, { resourceId: 5 });
      const scannedAt = Date.now();
      const { ticket } = service.claim(session.token, scannedAt);

      // Signing in took five minutes; the code itself expired long ago.
      await expect(service.redeemTicket(ticket, alice, scannedAt + 5 * 60_000)).resolves.toBeDefined();
      await expect(service.redeemTicket(ticket, bob, scannedAt + 5 * 60_000)).rejects.toBeInstanceOf(NotFoundException);

      const { ticket: stale } = service.claim(service.get(session.id, introducer.id).token);
      await expect(
        service.redeemTicket(stale, bob, Date.now() + MassIntroductionService.TICKET_TTL_MS + 1),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(resourceIntroductions.grant).toHaveBeenCalledTimes(1);
    });

    it('invalidates tickets when the session ends', async () => {
      const session = await service.start(introducer, { resourceId: 5 });
      const { ticket } = service.claim(session.token);

      service.cancel(session.id, introducer.id);

      await expect(service.redeemTicket(ticket, alice)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
