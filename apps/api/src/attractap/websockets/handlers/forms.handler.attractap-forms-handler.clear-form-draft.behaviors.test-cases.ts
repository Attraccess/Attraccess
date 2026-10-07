/* eslint-disable @typescript-eslint/no-explicit-any */
import { ResourceFormAction } from '@attraccess/database-entities';
import { registerAttractapFormsHandlerFixture } from './forms.handler.attractap-forms-handler.test-fixture';
import { AttractapEvent } from '../websocket.types';

export function registerClearFormDraftCases(fixture: ReturnType<typeof registerAttractapFormsHandlerFixture>) {
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
}

export function registerFormDraftKeyCases(fixture: ReturnType<typeof registerAttractapFormsHandlerFixture>) {
  describe('formDraftKey', () => {
    it('builds the key from resourceId and action', () => {
      const key = (fixture.handler as any).formDraftKey(10, ResourceFormAction.START);
      expect(key).toBe(`10:${ResourceFormAction.START}`);
    });
  });
}

export function registerGetFormDraftCases(fixture: ReturnType<typeof registerAttractapFormsHandlerFixture>) {
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
}

export function registerHandleResourceUsageFormCancelCases(
  fixture: ReturnType<typeof registerAttractapFormsHandlerFixture>,
) {
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
}
