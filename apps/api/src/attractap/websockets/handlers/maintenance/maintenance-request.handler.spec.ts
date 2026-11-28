/* eslint-disable @typescript-eslint/no-explicit-any -- Partial protocol mocks, as in the other reader handler tests. */
import { Test } from '@nestjs/testing';
import { LicenseError, LicenseService } from '../../../../license/license.service';
import { MaintenanceRequestService } from '../../../../resources/maintenances/maintenance-request.service';
import { ResourceListVisibilityService } from '../../../../resources/visibility/resource-list-visibility.service';
import { RbacService } from '../../../../users-and-auth/rbac/rbac.service';
import { UsersService } from '../../../../users-and-auth/users/users.service';
import { AttractapService } from '../../../attractap.service';
import { AttractapEventType } from '../../websocket.types';
import { ResourceActionGuard } from '../resource-action.guard';
import { CardSessionService } from '../ui/card-session.service';
import { AttractapMaintenanceRequestHandler } from './maintenance-request.handler';

describe('AttractapMaintenanceRequestHandler', () => {
  let handler: AttractapMaintenanceRequestHandler;
  let createRequest: jest.Mock;
  let verifyLicense: jest.Mock;
  let canSee: jest.Mock;
  let socket: any;

  beforeEach(async () => {
    createRequest = jest.fn().mockResolvedValue({ id: 1 });
    verifyLicense = jest.fn().mockResolvedValue({});
    canSee = jest.fn().mockResolvedValue(true);
    const moduleRef = await Test.createTestingModule({
      providers: [
        AttractapMaintenanceRequestHandler,
        // The real guard: the same checks every reader action passes.
        ResourceActionGuard,
        CardSessionService,
        {
          provide: AttractapService,
          useValue: { findReaderById: jest.fn().mockResolvedValue({ resources: [{ id: 5 }] }) },
        },
        { provide: UsersService, useValue: { findOne: jest.fn().mockResolvedValue({ id: 7 }) } },
        { provide: MaintenanceRequestService, useValue: { createRequest } },
        { provide: LicenseService, useValue: { verifyLicense } },
        { provide: ResourceListVisibilityService, useValue: { canSee } },
        {
          provide: RbacService,
          useValue: { getEffectivePermissions: jest.fn().mockResolvedValue(new Set(['resources.read'])) },
        },
      ],
    }).compile();
    handler = moduleRef.get(AttractapMaintenanceRequestHandler);
    socket = { readerId: 42, state: { verifiedUserId: 7 }, sendMessage: jest.fn().mockResolvedValue(undefined) };
  });

  const send = (payload: Record<string, unknown>) =>
    handler.handleCreateMaintenanceRequest(socket, {
      type: AttractapEventType.CREATE_MAINTENANCE_REQUEST,
      payload,
    } as any);
  const replies = () => socket.sendMessage.mock.calls.map(([event]: any) => event.data);

  it('files the request as the signed-in card holder and answers success', async () => {
    await send({ resourceId: 5, reason: 'Blade is dull', requestId: 3 });

    expect(createRequest).toHaveBeenCalledWith(5, 7, 'Blade is dull');
    expect(replies()).toEqual([
      { type: AttractapEventType.CREATE_MAINTENANCE_REQUEST, payload: { success: true, requestId: 3 } },
    ]);
  });

  it('acts for the user who asked even when the reader signs out meanwhile', async () => {
    verifyLicense.mockImplementation(async () => {
      socket.state.verifiedUserId = null;
    });
    await send({ resourceId: 5, reason: 'Blade is dull', requestId: 3 });

    expect(createRequest).toHaveBeenCalledWith(5, 7, 'Blade is dull');
  });

  it.each([
    ['without a signed-in card', { resourceId: 5 }, null, 'USER_NOT_AUTHENTICATED'],
    ['for a resource the reader does not serve', { resourceId: 6 }, 7, 'RESOURCE_NOT_ASSOCIATED_WITH_READER'],
    ['without a resource', {}, 7, 'INVALID_RESOURCE_ID'],
  ])('refuses %s', async (_name, payload, userId, error) => {
    socket.state.verifiedUserId = userId;
    await send({ ...payload, reason: 'Blade is dull', requestId: 3 });

    expect(createRequest).not.toHaveBeenCalled();
    expect(replies()[0].payload).toEqual({ error, requestId: 3 });
  });

  it('refuses without the maintenance license', async () => {
    verifyLicense.mockRejectedValue(new LicenseError('no maintenance module'));
    await send({ resourceId: 5, reason: 'Blade is dull', requestId: 3 });

    expect(createRequest).not.toHaveBeenCalled();
    expect(replies()[0].payload).toEqual({ error: 'MAINTENANCE_NOT_LICENSED', requestId: 3 });
  });

  it('refuses a machine the card holder may not see, like the web route', async () => {
    canSee.mockResolvedValue(false);
    await send({ resourceId: 5, reason: 'Blade is dull', requestId: 3 });

    expect(canSee).toHaveBeenCalledWith({ id: 7, effectivePermissions: new Set(['resources.read']) }, 5);
    expect(createRequest).not.toHaveBeenCalled();
    expect(replies()[0].payload).toEqual({ error: 'RESOURCE_NOT_FOUND', requestId: 3 });
  });

  it.each(['ab', 'x'.repeat(2001), undefined])('refuses the reason %#', async (reason) => {
    await send({ resourceId: 5, reason, requestId: 3 });

    expect(createRequest).not.toHaveBeenCalled();
    expect(replies()[0].payload).toEqual({ error: 'INVALID_REASON', requestId: 3 });
  });

  it('answers an error when filing fails', async () => {
    createRequest.mockRejectedValue(new Error('database gone'));
    await send({ resourceId: 5, reason: 'Blade is dull', requestId: 3 });

    expect(replies()[0].payload).toEqual({ error: 'REQUEST_FAILED', requestId: 3 });
  });
});
