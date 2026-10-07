import { Resource, ResourceType, ResourceUsage, ResourceUsageAction, User } from '@attraccess/database-entities';
import { ResourceSessionStartedEvent } from './events/resource-usage.events';
import { registerResourceUsageServiceFixture } from './resourceUsage.service.resource-usage-service.test-fixture';
export function registerDoorActionsCases(fixture: ReturnType<typeof registerResourceUsageServiceFixture>) {
  describe('door actions', () => {
    const mockUser: User = { id: 5 } as User;
    const doorResource: Resource = {
      id: 10,
      name: 'Front Door',
      type: ResourceType.Door,
      allowTakeOver: false,
      separateUnlockAndUnlatch: false,
    } as Resource;

    beforeEach(() => {
      // Common permission/maintenance happy-path mocks
      fixture.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      fixture.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      fixture.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      fixture.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      fixture.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);
    });

    it('should lock a door and emit event', async () => {
      fixture.resourceRepository.findOne.mockResolvedValue(doorResource);
      const saved = {
        id: 100,
        resourceId: 10,
        userId: 5,
        usageAction: ResourceUsageAction.DoorLock,
        startTime: new Date(),
        startNotes: null,
        endTime: new Date(),
        endNotes: null,
      } as unknown as ResourceUsage;
      fixture.resourceUsageRepository.save.mockResolvedValue(saved);
      fixture.resourceUsageRepository.findOne.mockResolvedValue(saved);

      const result = await fixture.service.lockDoor(10, mockUser);

      expect(result).toBe(saved);
      expect(fixture.eventEmitter.emitAsync).toHaveBeenCalledWith(
        ResourceSessionStartedEvent.EVENT_NAME,
        expect.any(Object),
      );

      const emitted = fixture.eventEmitter.emitAsync.mock.calls[0];
      const payload = emitted[1] as ResourceSessionStartedEvent;
      expect(payload).toBeInstanceOf(ResourceSessionStartedEvent);
      expect(payload.usage).toMatchObject({
        id: 100,
        usageAction: ResourceUsageAction.DoorLock,
        resourceId: 10,
        userId: 5,
      });
    });

    it('should unlock a door and emit event', async () => {
      fixture.resourceRepository.findOne.mockResolvedValue(doorResource);
      const saved = {
        id: 101,
        resourceId: 10,
        userId: 5,
        usageAction: ResourceUsageAction.DoorUnlock,
        startTime: new Date(),
        startNotes: null,
        endTime: new Date(),
        endNotes: null,
      } as unknown as ResourceUsage;
      fixture.resourceUsageRepository.save.mockResolvedValue(saved);
      fixture.resourceUsageRepository.findOne.mockResolvedValue(saved);

      const result = await fixture.service.unlockDoor(10, mockUser);

      expect(result).toBe(saved);
      expect(fixture.eventEmitter.emitAsync).toHaveBeenCalledWith(
        ResourceSessionStartedEvent.EVENT_NAME,
        expect.any(Object),
      );

      const emitted = fixture.eventEmitter.emitAsync.mock.calls[0];
      const payload = emitted[1] as ResourceSessionStartedEvent;
      expect(payload).toBeInstanceOf(ResourceSessionStartedEvent);
      expect(payload.usage).toMatchObject({
        id: 101,
        usageAction: ResourceUsageAction.DoorUnlock,
        resourceId: 10,
        userId: 5,
      });
    });

    it('should unlatch a door when supported and emit event', async () => {
      fixture.resourceRepository.findOne.mockResolvedValue({
        ...doorResource,
        separateUnlockAndUnlatch: true,
      } as Resource);
      const saved = {
        id: 102,
        resourceId: 10,
        userId: 5,
        usageAction: ResourceUsageAction.DoorUnlatch,
        startTime: new Date(),
        startNotes: null,
        endTime: new Date(),
        endNotes: null,
      } as unknown as ResourceUsage;
      fixture.resourceUsageRepository.save.mockResolvedValue(saved);
      fixture.resourceUsageRepository.findOne.mockResolvedValue(saved);

      const result = await fixture.service.unlatchDoor(10, mockUser);

      expect(result).toBe(saved);
      expect(fixture.eventEmitter.emitAsync).toHaveBeenCalledWith(
        ResourceSessionStartedEvent.EVENT_NAME,
        expect.any(Object),
      );

      const emitted = fixture.eventEmitter.emitAsync.mock.calls[0];
      const payload = emitted[1] as ResourceSessionStartedEvent;
      expect(payload).toBeInstanceOf(ResourceSessionStartedEvent);
      expect(payload.usage).toMatchObject({
        id: 102,
        usageAction: ResourceUsageAction.DoorUnlatch,
        resourceId: 10,
        userId: 5,
      });
    });

    it('should propagate emitAsync errors from door lock', async () => {
      fixture.resourceRepository.findOne.mockResolvedValue(doorResource);
      const saved = {
        id: 100,
        resourceId: 10,
        userId: 5,
        usageAction: ResourceUsageAction.DoorLock,
        startTime: new Date(),
        endTime: new Date(),
      } as unknown as ResourceUsage;
      fixture.resourceUsageRepository.save.mockResolvedValue(saved);
      fixture.resourceUsageRepository.findOne.mockResolvedValue(saved);
      fixture.eventEmitter.emitAsync.mockRejectedValueOnce(new Error('Flow error'));

      await expect(fixture.service.lockDoor(10, mockUser)).rejects.toThrow('Flow error');
    });

    it('should propagate emitAsync errors from door unlock', async () => {
      fixture.resourceRepository.findOne.mockResolvedValue(doorResource);
      const saved = {
        id: 101,
        resourceId: 10,
        userId: 5,
        usageAction: ResourceUsageAction.DoorUnlock,
        startTime: new Date(),
        endTime: new Date(),
      } as unknown as ResourceUsage;
      fixture.resourceUsageRepository.save.mockResolvedValue(saved);
      fixture.resourceUsageRepository.findOne.mockResolvedValue(saved);
      fixture.eventEmitter.emitAsync.mockRejectedValueOnce(new Error('Flow error'));

      await expect(fixture.service.unlockDoor(10, mockUser)).rejects.toThrow('Flow error');
    });

    it('should propagate emitAsync errors from door unlatch', async () => {
      fixture.resourceRepository.findOne.mockResolvedValue({
        ...doorResource,
        separateUnlockAndUnlatch: true,
      } as Resource);
      const saved = {
        id: 102,
        resourceId: 10,
        userId: 5,
        usageAction: ResourceUsageAction.DoorUnlatch,
        startTime: new Date(),
        endTime: new Date(),
      } as unknown as ResourceUsage;
      fixture.resourceUsageRepository.save.mockResolvedValue(saved);
      fixture.resourceUsageRepository.findOne.mockResolvedValue(saved);
      fixture.eventEmitter.emitAsync.mockRejectedValueOnce(new Error('Flow error'));

      await expect(fixture.service.unlatchDoor(10, mockUser)).rejects.toThrow('Flow error');
    });

    it('should throw when operating non-door resource', async () => {
      fixture.resourceRepository.findOne.mockResolvedValue({ ...doorResource, type: ResourceType.Machine } as Resource);

      await expect(fixture.service.lockDoor(10, mockUser)).rejects.toThrow('Resource is not a door');
      await expect(fixture.service.unlockDoor(10, mockUser)).rejects.toThrow('Resource is not a door');
    });

    it('should throw when unlatching unsupported door', async () => {
      fixture.resourceRepository.findOne.mockResolvedValue({
        ...doorResource,
        separateUnlockAndUnlatch: false,
      } as Resource);

      await expect(fixture.service.unlatchDoor(10, mockUser)).rejects.toThrow(
        'Door (ID: 10, Name: Front Door) does not support unlatching',
      );
    });
  });
}
