import { NotFoundException } from '@nestjs/common';
import { ProjectMemberRole, type ProjectMemberRecord, type ProjectRecord } from '@attraccess/application-models';
import { ProjectAccessService } from './project-access.service';
import type { ProjectStore } from './project.port';

const project = (id: number, ownerId: number): ProjectRecord =>
  ({ id, name: `P${id}`, owner: { id: ownerId } }) as unknown as ProjectRecord;

const membership = (projectId: number, userId: number): ProjectMemberRecord =>
  ({ id: projectId * 10, projectId, userId, role: ProjectMemberRole.VIEWER }) as ProjectMemberRecord;

describe('ProjectAccessService', () => {
  let store: { [K in keyof ProjectStore]: jest.Mock };
  let service: ProjectAccessService;

  beforeEach(() => {
    store = {
      findWithOwner: jest.fn(),
      findOwned: jest.fn(),
      findMembership: jest.fn(),
      findMembershipsOfUser: jest.fn(),
    } as unknown as typeof store;
    service = new ProjectAccessService(store as unknown as ProjectStore);
  });

  it('ensureOwner returns the owned project and hides foreign ones as not found', async () => {
    store.findOwned.mockResolvedValueOnce(project(1, 5)).mockResolvedValueOnce(null);

    expect((await service.ensureOwner(5, 1)).id).toBe(1);
    await expect(service.ensureOwner(6, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('gives the owner management access without a membership lookup', async () => {
    store.findWithOwner.mockResolvedValue(project(1, 5));

    const result = await service.getAccessOrThrow(5, 1);

    expect(result.access).toEqual({ isOwner: true, role: null, canManageProject: true });
    expect(store.findMembership).not.toHaveBeenCalled();
  });

  it('gives a member their role without management access', async () => {
    store.findWithOwner.mockResolvedValue(project(1, 5));
    store.findMembership.mockResolvedValue(membership(1, 7));

    const result = await service.getAccessOrThrow(7, 1);

    expect(result.access).toEqual({ isOwner: false, role: 'viewer', canManageProject: false });
  });

  it('answers not found for a missing project and for a user without any relation to it', async () => {
    store.findWithOwner.mockResolvedValueOnce(null).mockResolvedValueOnce(project(1, 5));
    store.findMembership.mockResolvedValue(null);

    await expect(service.getAccessOrThrow(7, 1)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getAccessOrThrow(7, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adds access metadata to a list with one membership lookup', async () => {
    store.findMembershipsOfUser.mockResolvedValue([membership(2, 7)]);

    const result = await service.addAccessMetadata(7, [project(1, 7), project(2, 5)]);

    expect(store.findMembershipsOfUser).toHaveBeenCalledWith(7, [1, 2]);
    expect(result.map((entry) => entry.access)).toEqual([
      { isOwner: true, role: null, canManageProject: true },
      { isOwner: false, role: 'viewer', canManageProject: false },
    ]);
    expect(await service.addAccessMetadata(7, [])).toEqual([]);
  });
});
