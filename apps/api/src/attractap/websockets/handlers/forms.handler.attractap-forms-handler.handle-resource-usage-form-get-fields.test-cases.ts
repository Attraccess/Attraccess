import { ResourceFormAction } from '@attraccess/database-entities';
import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { registerAttractapFormsHandlerFixture } from './forms.handler.attractap-forms-handler.test-fixture';
export function registerHandleResourceUsageFormGetFieldsCases(
  fixture: ReturnType<typeof registerAttractapFormsHandlerFixture>,
) {
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
}
