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

  /** Scan the QR code and type the code shown next to it, as the signed-in participant. */
  const scan = (session: { publicId: string; code: string }, user: { id: number; username: string }) =>
    service.redeem(session.publicId, session.code, user);

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
          useValue: {
            findOne: jest.fn(({ where }) => Promise.resolve({ id: where.id, name: 'Laser' })),
            // Resources of a group (group 3 holds resources 5 and 6).
            find: jest.fn(() => Promise.resolve([{ id: 5 }, { id: 6 }])),
          },
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

  it('rejects unknown sessions', async () => {
    await expect(service.redeem('not-a-session', '123456', alice)).rejects.toBeInstanceOf(NotFoundException);
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

  describe('join codes', () => {
    const PERIOD_MS = 15_000;

    it('keeps the QR code fixed and changes the 6-digit code every 15 seconds', async () => {
      jest.useFakeTimers();
      const session = await service.start(introducer, { resourceId: 5 });
      const startedAt = Date.now();

      expect(session.code).toMatch(/^\d{6}$/);
      expect(new Date(session.codeRefreshAt).getTime() - startedAt).toBeLessThanOrEqual(PERIOD_MS);
      const later = service.get(session.id, introducer.id);
      expect(later.publicId).toBe(session.publicId);

      // Still accepted one period later (typed just before it changed), no longer two periods later.
      await expect(service.redeem(session.publicId, session.code, alice, startedAt + PERIOD_MS)).resolves.toBeDefined();
      await expect(
        service.redeem(session.publicId, session.code, bob, startedAt + 2 * PERIOD_MS + 1000),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects wrong codes', async () => {
      const session = await service.start(introducer, { resourceId: 5 });
      const wrong = String((Number(session.code) + 1) % 1_000_000).padStart(6, '0');

      await expect(service.redeem(session.publicId, wrong, alice)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.redeem(session.publicId, '12345', alice)).rejects.toBeInstanceOf(BadRequestException);
      expect(resourceIntroductions.grant).not.toHaveBeenCalled();
    });

    it('limits wrong codes per participant, so one person cannot lock out the others', async () => {
      jest.useFakeTimers();
      const session = await service.start(introducer, { resourceId: 5 });
      const wrong = String((Number(session.code) + 1) % 1_000_000).padStart(6, '0');
      for (let i = 0; i < MassIntroductionService.MAX_WRONG_CODES_PER_MINUTE; i++) {
        await expect(service.redeem(session.publicId, wrong, alice)).rejects.toBeInstanceOf(BadRequestException);
      }

      await expect(service.redeem(session.publicId, session.code, alice)).rejects.toEqual(
        expect.objectContaining({ status: 429 }),
      );
      await expect(service.redeem(session.publicId, session.code, bob)).resolves.toBeDefined();

      jest.setSystemTime(Date.now() + 60_000);
      await expect(
        service.redeem(session.publicId, service.get(session.id, introducer.id).code, alice),
      ).resolves.toBeDefined();
    });

    it('introduces each participant once, even for concurrent submissions', async () => {
      const session = await service.start(introducer, { resourceId: 5 });

      await Promise.all([scan(session, alice), scan(session, alice), scan(session, alice)]);

      expect(resourceIntroductions.grant).toHaveBeenCalledTimes(1);
    });

    it('reports a participant who already joined without checking the code again', async () => {
      const session = await service.start(introducer, { resourceId: 5 });
      await scan(session, alice);

      await expect(service.redeem(session.publicId, '000000', alice)).resolves.toEqual(
        expect.objectContaining({ alreadyIntroduced: false }),
      );
    });

    it('stops accepting codes when the session ends', async () => {
      const session = await service.start(introducer, { resourceId: 5 });

      service.cancel(session.id, introducer.id);

      await expect(scan(session, alice)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('readers', () => {
    it('only arms readers linked to the target', async () => {
      await service.start(introducer, { resourceId: 5, readerId: 3 });
      expect(readerPort.arm).toHaveBeenCalledWith(expect.objectContaining({ readerId: 3, allowedResourceIds: [5] }));

      await service.start(introducer, { resourceGroupId: 3, readerId: 4 });
      expect(readerPort.arm).toHaveBeenLastCalledWith(
        expect.objectContaining({ readerId: 4, allowedResourceIds: [5, 6] }),
      );
    });
  });
});
