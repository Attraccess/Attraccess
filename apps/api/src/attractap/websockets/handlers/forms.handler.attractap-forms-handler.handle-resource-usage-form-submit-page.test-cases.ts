import { ResourceFormAction } from '@attraccess/database-entities';
import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { registerAttractapFormsHandlerFixture } from './forms.handler.attractap-forms-handler.test-fixture';
export function registerHandleResourceUsageFormSubmitPageCases(
  fixture: ReturnType<typeof registerAttractapFormsHandlerFixture>,
) {
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
}
