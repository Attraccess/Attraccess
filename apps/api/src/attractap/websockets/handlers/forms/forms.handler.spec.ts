/* eslint-disable @typescript-eslint/no-explicit-any */

import { registerAttractapFormsHandlerFixture } from './handler.test-fixture';
import { ResourceFormAction } from '@attraccess/database-entities';
import { AttractapEvent, AttractapEventType } from '../../websocket.types';

describe('AttractapFormsHandler', () => {
  const fixture = registerAttractapFormsHandlerFixture();

  describe('formDraftKey', () => {
    it('builds the key from resourceId and action', () => {
      const key = (fixture.handler as any).formDraftKey(10, ResourceFormAction.START);
      expect(key).toBe(`10:${ResourceFormAction.START}`);
    });
  });

  describe('getFormDraft', () => {
    it('returns empty object when no formDrafts present', () => {
      const socket = fixture.createMockSocket();
      expect(fixture.handler.getFormDraft(socket, 10, ResourceFormAction.START)).toEqual({});
    });

    it('returns empty object when formDrafts present but key missing', () => {
      const socket = fixture.createMockSocket({ state: { lastAuthenticatedUserId: 1, formDrafts: {} } });
      expect(fixture.handler.getFormDraft(socket, 10, ResourceFormAction.START)).toEqual({});
    });

    it('returns the stored draft for the key', () => {
      const stored = { 1: 'a', 2: 'b' };
      const socket = fixture.createMockSocket({
        state: {
          lastAuthenticatedUserId: 1,
          formDrafts: { [`10:${ResourceFormAction.START}`]: stored },
        },
      });
      expect(fixture.handler.getFormDraft(socket, 10, ResourceFormAction.START)).toBe(stored);
    });
  });

  describe('clearFormDraft', () => {
    it('deletes the key when formDrafts present', () => {
      const socket = fixture.createMockSocket({
        state: {
          lastAuthenticatedUserId: 1,
          formDrafts: {
            [`10:${ResourceFormAction.START}`]: { 1: 'a' },
            [`11:${ResourceFormAction.END}`]: { 2: 'b' },
          },
        },
      });

      fixture.handler.clearFormDraft(socket, 10, ResourceFormAction.START);

      expect(socket.state.formDrafts).toEqual({ [`11:${ResourceFormAction.END}`]: { 2: 'b' } });
    });

    it('is a no-op when formDrafts absent', () => {
      const socket = fixture.createMockSocket();
      expect(() => fixture.handler.clearFormDraft(socket, 10, ResourceFormAction.START)).not.toThrow();
      expect(socket.state.formDrafts).toBeUndefined();
    });
  });

  describe('handleResourceUsageFormCancel', () => {
    it('clears only the cancelled form draft', () => {
      const socket = fixture.createMockSocket({
        state: {
          lastAuthenticatedUserId: 1,
          formDrafts: {
            [`10:${ResourceFormAction.START}`]: { 1: 'a' },
            [`11:${ResourceFormAction.END}`]: { 2: 'b' },
          },
        },
      });

      fixture.handler.handleResourceUsageFormCancel(socket, {
        payload: { resourceId: 10, action: ResourceFormAction.START },
      } as AttractapEvent['data']);

      expect(socket.state.formDrafts).toEqual({ [`11:${ResourceFormAction.END}`]: { 2: 'b' } });
    });
  });

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

  describe('handleResourceUsageFormGetFields', () => {
    const eventData = {
      payload: { resourceId: 10, action: ResourceFormAction.START, formId: 7, offset: 0, limit: 5 },
    } as AttractapEvent['data'];

    it('returns early without fetching fields when guard fails', async () => {
      fixture.mockResourceActionGuard.validateResourceAction.mockResolvedValue(false);
      const socket = fixture.createMockSocket();

      await fixture.handler.handleResourceUsageFormGetFields(socket, eventData);

      expect(fixture.mockResourceActionGuard.validateResourceAction).toHaveBeenCalledWith(
        socket,
        10,
        AttractapEventType.START_RESOURCE_USAGE_SESSION,
      );
      expect(fixture.mockResourceFormsService.getFieldsWindow).not.toHaveBeenCalled();
      expect(socket.sendMessage).not.toHaveBeenCalled();
    });

    it('fetches a fields window and sends mapped fields when guard passes', async () => {
      fixture.mockResourceActionGuard.validateResourceAction.mockResolvedValue(true);
      fixture.mockResourceFormsService.getFieldsWindow.mockResolvedValue({
        totalFieldCount: 2,
        fields: [
          {
            id: 1,
            name: 'Name',
            description: 'Your name',
            type: 'text',
            isRequired: true,
            options: ['a', 'b'],
          },
          {
            id: 2,
            name: 'Extra',
            // description and options undefined -> mapped to null
            type: 'text',
            isRequired: false,
          },
        ],
      });
      const socket = fixture.createMockSocket({
        state: {
          lastAuthenticatedUserId: 1,
          formDrafts: { [`10:${ResourceFormAction.START}`]: { 1: 'draft-1' } },
        },
      });

      await fixture.handler.handleResourceUsageFormGetFields(socket, eventData);

      expect(fixture.mockResourceFormsService.getFieldsWindow).toHaveBeenCalledWith(10, 7, 0, 5);
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.RESOURCE_USAGE_FORM_FIELDS,
            payload: {
              resourceId: 10,
              action: ResourceFormAction.START,
              formId: 7,
              offset: 0,
              totalFieldCount: 2,
              fields: [
                {
                  id: 1,
                  name: 'Name',
                  description: 'Your name',
                  type: 'text',
                  isRequired: true,
                  options: ['a', 'b'],
                  value: 'draft-1',
                },
                {
                  id: 2,
                  name: 'Extra',
                  description: null,
                  type: 'text',
                  isRequired: false,
                  options: null,
                  value: null,
                },
              ],
            },
          }),
        }),
      );
    });
  });

  describe('handleResourceUsageFormSubmitPage', () => {
    const answers = [
      { fieldId: 1, value: 'v1' },
      { fieldId: 2, value: 'v2' },
    ];
    const eventData = {
      payload: { resourceId: 10, action: ResourceFormAction.START, formId: 7, offset: 0, answers },
    } as AttractapEvent['data'];

    it('returns early without validating when guard fails', async () => {
      fixture.mockResourceActionGuard.validateResourceAction.mockResolvedValue(false);
      const socket = fixture.createMockSocket();

      await fixture.handler.handleResourceUsageFormSubmitPage(socket, eventData);

      expect(fixture.mockResourceActionGuard.validateResourceAction).toHaveBeenCalledWith(
        socket,
        10,
        AttractapEventType.START_RESOURCE_USAGE_SESSION,
      );
      expect(fixture.mockResourceFormsService.validatePageAnswers).not.toHaveBeenCalled();
      expect(socket.sendMessage).not.toHaveBeenCalled();
    });

    it('stores the draft and sends a valid result when answers are valid', async () => {
      fixture.mockResourceActionGuard.validateResourceAction.mockResolvedValue(true);
      fixture.mockResourceFormsService.validatePageAnswers.mockResolvedValue({ valid: true, errors: {} });
      const socket = fixture.createMockSocket();

      await fixture.handler.handleResourceUsageFormSubmitPage(socket, eventData);

      expect(fixture.mockResourceFormsService.validatePageAnswers).toHaveBeenCalledWith(10, 7, answers);
      expect(socket.state.formDrafts).toEqual({
        [`10:${ResourceFormAction.START}`]: { 1: 'v1', 2: 'v2' },
      });
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.RESOURCE_USAGE_FORM_PAGE_RESULT,
            payload: {
              resourceId: 10,
              action: ResourceFormAction.START,
              formId: 7,
              offset: 0,
              valid: true,
              errors: {},
            },
          }),
        }),
      );
    });

    it('merges into an existing draft for the same key when valid', async () => {
      fixture.mockResourceActionGuard.validateResourceAction.mockResolvedValue(true);
      fixture.mockResourceFormsService.validatePageAnswers.mockResolvedValue({ valid: true, errors: {} });
      const socket = fixture.createMockSocket({
        state: {
          lastAuthenticatedUserId: 1,
          formDrafts: { [`10:${ResourceFormAction.START}`]: { 9: 'existing' } },
        },
      });

      await fixture.handler.handleResourceUsageFormSubmitPage(socket, eventData);

      expect(socket.state.formDrafts).toEqual({
        [`10:${ResourceFormAction.START}`]: { 9: 'existing', 1: 'v1', 2: 'v2' },
      });
    });

    it('does not store a draft and sends an invalid result when answers are invalid', async () => {
      fixture.mockResourceActionGuard.validateResourceAction.mockResolvedValue(true);
      const errors = { 1: 'Required' };
      fixture.mockResourceFormsService.validatePageAnswers.mockResolvedValue({ valid: false, errors });
      const socket = fixture.createMockSocket();

      await fixture.handler.handleResourceUsageFormSubmitPage(socket, eventData);

      expect(fixture.mockResourceFormsService.validatePageAnswers).toHaveBeenCalledWith(10, 7, answers);
      expect(socket.state.formDrafts).toBeUndefined();
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.RESOURCE_USAGE_FORM_PAGE_RESULT,
            payload: {
              resourceId: 10,
              action: ResourceFormAction.START,
              formId: 7,
              offset: 0,
              valid: false,
              errors,
            },
          }),
        }),
      );
    });
  });
});
