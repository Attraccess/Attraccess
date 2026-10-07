/* eslint-disable @typescript-eslint/no-explicit-any */
import { ResourceFormAction } from '@attraccess/database-entities';
import { AttractapEventType } from '../websocket.types';
import { registerAttractapFormsHandlerFixture } from './forms.handler.attractap-forms-handler.test-fixture';
export function registerEnsureFormsSatisfiedCases(fixture: ReturnType<typeof registerAttractapFormsHandlerFixture>) {
  describe('ensureFormsSatisfied', () => {
    it('returns [] when there are no forms', async () => {
      fixture.mockResourceFormsService.getFormsForAction.mockResolvedValue([]);
      const socket = fixture.createMockSocket();

      const result = await fixture.handler.ensureFormsSatisfied({
        socket,
        resourceId: 10,
        action: ResourceFormAction.START,
      });

      expect(result).toEqual([]);
      expect(fixture.mockResourceFormsService.getFormsForAction).toHaveBeenCalledWith(10, ResourceFormAction.START);
      expect(socket.sendMessage).not.toHaveBeenCalled();
    });

    it('returns mapped submission DTOs when all required fields present (only fields with a draft value)', async () => {
      fixture.mockResourceFormsService.getFormsForAction.mockResolvedValue([
        {
          id: 7,
          name: 'Form A',
          fields: [
            { id: 1, isRequired: true },
            { id: 2, isRequired: false },
            { id: 3, isRequired: false },
          ],
        },
      ]);
      const socket = fixture.createMockSocket({
        state: {
          lastAuthenticatedUserId: 1,
          formDrafts: { [`10:${ResourceFormAction.START}`]: { 1: 'req-value', 2: 'opt-value' } },
        },
      });

      const result = await fixture.handler.ensureFormsSatisfied({
        socket,
        resourceId: 10,
        action: ResourceFormAction.START,
      });

      // field 3 has no draft value (undefined) -> omitted
      expect(result).toEqual([
        {
          formId: 7,
          answers: [
            { fieldId: 1, value: 'req-value' },
            { fieldId: 2, value: 'opt-value' },
          ],
        },
      ]);
      expect(socket.sendMessage).not.toHaveBeenCalled();
    });

    it('sends a form request and returns null when required fields incomplete, resolving resourceName via findReaderById', async () => {
      fixture.mockResourceFormsService.getFormsForAction.mockResolvedValue([
        {
          id: 7,
          name: 'Form A',
          fields: [{ id: 1, isRequired: true }],
        },
      ]);
      fixture.mockAttractapService.findReaderById.mockResolvedValue({
        id: 42,
        resources: [{ id: 10, name: 'Laser Cutter' }],
      });
      const socket = fixture.createMockSocket();

      const result = await fixture.handler.ensureFormsSatisfied({
        socket,
        resourceId: 10,
        action: ResourceFormAction.START,
      });

      expect(result).toBeNull();
      expect(fixture.mockAttractapService.findReaderById).toHaveBeenCalledWith(42);
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.RESOURCE_USAGE_FORM_REQUEST,
            payload: {
              resourceId: 10,
              resourceName: 'Laser Cutter',
              action: ResourceFormAction.START,
              forms: [{ id: 7, name: 'Form A', fieldCount: 1 }],
            },
          }),
        }),
      );
    });

    it('treats empty-string and null draft values as missing for required fields', async () => {
      fixture.mockResourceFormsService.getFormsForAction.mockResolvedValue([
        {
          id: 7,
          name: 'Form A',
          fields: [
            { id: 1, isRequired: true },
            { id: 2, isRequired: true },
          ],
        },
      ]);
      const socket = fixture.createMockSocket({
        state: {
          lastAuthenticatedUserId: 1,
          formDrafts: { [`10:${ResourceFormAction.START}`]: { 1: '', 2: null } },
        },
      });

      const result = await fixture.handler.ensureFormsSatisfied({
        socket,
        resourceId: 10,
        action: ResourceFormAction.START,
      });

      expect(result).toBeNull();
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: AttractapEventType.RESOURCE_USAGE_FORM_REQUEST }),
        }),
      );
    });

    it('leaves resourceName undefined when reader has no matching resource', async () => {
      fixture.mockResourceFormsService.getFormsForAction.mockResolvedValue([
        { id: 7, name: 'Form A', fields: [{ id: 1, isRequired: true }] },
      ]);
      fixture.mockAttractapService.findReaderById.mockResolvedValue({ id: 42, resources: [{ id: 99, name: 'Other' }] });
      const socket = fixture.createMockSocket();

      await fixture.handler.ensureFormsSatisfied({ socket, resourceId: 10, action: ResourceFormAction.START });

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.RESOURCE_USAGE_FORM_REQUEST,
            payload: expect.objectContaining({ resourceName: undefined }),
          }),
        }),
      );
    });

    it('does not call findReaderById when socket has no readerId (resourceName undefined)', async () => {
      fixture.mockResourceFormsService.getFormsForAction.mockResolvedValue([
        { id: 7, name: 'Form A', fields: [{ id: 1, isRequired: true }] },
      ]);
      const socket = fixture.createMockSocket({ readerId: null });

      const result = await fixture.handler.ensureFormsSatisfied({
        socket,
        resourceId: 10,
        action: ResourceFormAction.START,
      });

      expect(result).toBeNull();
      expect(fixture.mockAttractapService.findReaderById).not.toHaveBeenCalled();
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.RESOURCE_USAGE_FORM_REQUEST,
            payload: expect.objectContaining({ resourceName: undefined }),
          }),
        }),
      );
    });

    it('tolerates findReaderById throwing -> resourceName undefined and logs debug', async () => {
      fixture.mockResourceFormsService.getFormsForAction.mockResolvedValue([
        { id: 7, name: 'Form A', fields: [{ id: 1, isRequired: true }] },
      ]);
      fixture.mockAttractapService.findReaderById.mockRejectedValue(new Error('boom'));
      const socket = fixture.createMockSocket();

      const result = await fixture.handler.ensureFormsSatisfied({
        socket,
        resourceId: 10,
        action: ResourceFormAction.START,
      });

      expect(result).toBeNull();
      expect((fixture.handler as any).logger.debug).toHaveBeenCalledWith(expect.stringContaining('boom'));
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.RESOURCE_USAGE_FORM_REQUEST,
            payload: expect.objectContaining({ resourceName: undefined }),
          }),
        }),
      );
    });
  });
}
