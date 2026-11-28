import { NotFoundException } from '@nestjs/common';
import { LicenseError, type LicenseService } from '../../../license/license.service';
import type { MaintenanceRequestService } from '../../maintenances/maintenance-request.service';
import { SessionEndMaintenanceRequests } from './session-end-maintenance-requests';

describe('SessionEndMaintenanceRequests', () => {
  let createRequest: jest.Mock;
  let verifyLicense: jest.Mock;
  let service: SessionEndMaintenanceRequests;

  beforeEach(() => {
    createRequest = jest.fn().mockResolvedValue({ id: 1 });
    verifyLicense = jest.fn().mockResolvedValue({});
    service = new SessionEndMaintenanceRequests(
      { createRequest } as unknown as MaintenanceRequestService,
      { verifyLicense } as unknown as LicenseService,
    );
  });

  it('does nothing when the end carried no request', async () => {
    await expect(service.fileAfterEnd(5, 7, undefined)).resolves.toBeUndefined();
    expect(createRequest).not.toHaveBeenCalled();
    expect(verifyLicense).not.toHaveBeenCalled();
  });

  it('files the request for the user who ended the session, through the same service as the resource page', async () => {
    await expect(service.fileAfterEnd(5, 7, { reason: 'Blade is dull' })).resolves.toBe(true);
    expect(createRequest).toHaveBeenCalledTimes(1);
    expect(createRequest).toHaveBeenCalledWith(5, 7, 'Blade is dull');
    expect(verifyLicense).toHaveBeenCalledWith({ modules: ['maintenance'] });
  });

  it('files nothing without the maintenance license', async () => {
    verifyLicense.mockRejectedValue(new LicenseError('no maintenance module'));
    await expect(service.fileAfterEnd(5, 7, { reason: 'Blade is dull' })).resolves.toBe(false);
    expect(createRequest).not.toHaveBeenCalled();
  });

  it.each([
    ['too short', { reason: 'ab' }],
    ['too long', { reason: 'x'.repeat(2001) }],
    ['not a string', { reason: 42 }],
    ['without a reason', {}],
    ['not an object', 'Blade is dull'],
  ])('files nothing when the reason is %s', async (_name, request) => {
    await expect(service.fileAfterEnd(5, 7, request)).resolves.toBe(false);
    expect(createRequest).not.toHaveBeenCalled();
  });

  it('reports a failed filing instead of failing the finished end', async () => {
    createRequest.mockRejectedValue(new NotFoundException('gone'));
    await expect(service.fileAfterEnd(5, 7, { reason: 'Blade is dull' })).resolves.toBe(false);
  });
});
