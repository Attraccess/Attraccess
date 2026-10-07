/* eslint-disable @typescript-eslint/no-explicit-any */

import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { registerFixture0 } from './card.handler.attractap-card-handler.test-fixture';
export function registerCases0_9(fixture: ReturnType<typeof registerFixture0>) {
  describe('handleCardAuthenticationRequest', () => {
    const activeCard = {
      keyNo: 3,
      key: 'cardkey',
      isActive: true,
      user: {
        id: 5,
        username: 'carduser',
      },
    };

    it.each(['pending', 'failed'])('authenticates while the supplemental resource list is %s', async (state) => {
      const socket = fixture.createMockSocket();
      const failure = new Error('Resource list unavailable');
      fixture.attractapService.getNFCCardByUID.mockResolvedValueOnce(activeCard);
      (fixture.handler as any).resourceListService.sendResourceListToSocket.mockImplementation(() =>
        state === 'pending' ? new Promise(() => undefined) : Promise.reject(failure),
      );

      await fixture.handler.handleCardAuthenticationRequest(socket, {
        payload: { uid: 'abc', resourceId: 10 },
      } as AttractapEvent['data']);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.CARD_AUTHENTICATION_DATA,
            payload: expect.objectContaining({ key: activeCard.key, username: activeCard.user.username }),
          }),
        }),
      );
      if (state === 'failed')
        expect((fixture.handler as any).logger.error).toHaveBeenCalledWith(expect.any(String), failure);
    });

    it('always increments attractapNfcTapsTotal', async () => {
      const socket = fixture.createMockSocket();
      const data = { payload: { uid: '', resourceId: 10 } } as AttractapEvent['data'];

      await fixture.handler.handleCardAuthenticationRequest(socket, data);

      expect(fixture.metricsService.attractapNfcTapsTotal.inc).toHaveBeenCalledTimes(1);
    });

    it('sends INVALID_UID when uid is invalid', async () => {
      const socket = fixture.createMockSocket();
      const data = { payload: { uid: '', resourceId: 10 } } as AttractapEvent['data'];

      await fixture.handler.handleCardAuthenticationRequest(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.CARD_AUTHENTICATION_DATA,
            payload: { error: 'INVALID_UID' },
          }),
        }),
      );
      expect(fixture.attractapService.getNFCCardByUID).not.toHaveBeenCalled();
    });

    it('sends CARD_NOT_FOUND when the card does not exist', async () => {
      const socket = fixture.createMockSocket();
      fixture.attractapService.getNFCCardByUID.mockResolvedValueOnce(null);
      const data = { payload: { uid: 'abc', resourceId: 10 } } as AttractapEvent['data'];

      await fixture.handler.handleCardAuthenticationRequest(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.CARD_AUTHENTICATION_DATA,
            payload: { error: 'CARD_NOT_FOUND' },
          }),
        }),
      );
    });

    it('sends CARD_NOT_ACTIVE when the card is inactive', async () => {
      const socket = fixture.createMockSocket();
      fixture.attractapService.getNFCCardByUID.mockResolvedValueOnce({ ...activeCard, isActive: false });
      const data = { payload: { uid: 'abc', resourceId: 10 } } as AttractapEvent['data'];

      await fixture.handler.handleCardAuthenticationRequest(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.CARD_AUTHENTICATION_DATA,
            payload: { error: 'CARD_NOT_ACTIVE' },
          }),
        }),
      );
      expect(fixture.resourceUsageService.canControllResource).not.toHaveBeenCalled();
    });

    it('sets lastAuthenticatedUserId and sends CARD_AUTHENTICATION_DATA on success', async () => {
      const socket = fixture.createMockSocket();
      fixture.attractapService.getNFCCardByUID.mockResolvedValueOnce(activeCard);
      fixture.resourceUsageService.canControllResource.mockResolvedValueOnce(true);
      fixture.resourceIntroducersService.isIntroducer.mockResolvedValueOnce(true);
      fixture.rbacService.getEffectivePermissions.mockResolvedValueOnce(new Set(['resources.update']));
      const data = { payload: { uid: 'abc', resourceId: 10 } } as AttractapEvent['data'];

      await fixture.handler.handleCardAuthenticationRequest(socket, data);

      expect(socket.state.lastAuthenticatedUserId).toBe(activeCard.user.id);
      expect(fixture.resourceUsageService.canControllResource).toHaveBeenCalledWith(10, activeCard.user);
      expect(fixture.resourceIntroducersService.isIntroducer).toHaveBeenCalledWith(10, activeCard.user.id, true);
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.CARD_AUTHENTICATION_DATA,
            payload: {
              keyNo: activeCard.keyNo,
              key: activeCard.key,
              username: activeCard.user.username,
              canManageResource: true,
              hasIntroduction: true,
              isIntroducer: true,
              supervisionMode: 'introduction_required',
              requiresSupervisor: false,
            },
          }),
        }),
      );
    });

    it('flags requiresSupervisor for a SUPERVISION_REQUIRED resource even when introduced', async () => {
      const socket = fixture.createMockSocket();
      fixture.attractapService.getNFCCardByUID.mockResolvedValueOnce(activeCard);
      fixture.resourceUsageService.canControllResource.mockResolvedValueOnce(true);
      fixture.resourceIntroducersService.isIntroducer.mockResolvedValueOnce(false);
      fixture.resourceRepository.findOne.mockResolvedValueOnce({ id: 10, supervisionMode: 'supervision_required' });
      const data = { payload: { uid: 'abc', resourceId: 10 } } as AttractapEvent['data'];

      await fixture.handler.handleCardAuthenticationRequest(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.CARD_AUTHENTICATION_DATA,
            payload: expect.objectContaining({ supervisionMode: 'supervision_required', requiresSupervisor: true }),
          }),
        }),
      );
    });

    it('keeps requiresSupervisor in the auth payload for SUPERVISION_ALLOWED when the user has no introduction', async () => {
      const socket = fixture.createMockSocket();
      fixture.attractapService.getNFCCardByUID.mockResolvedValueOnce(activeCard);
      fixture.resourceUsageService.canControllResource.mockResolvedValueOnce(false);
      fixture.resourceIntroducersService.isIntroducer.mockResolvedValueOnce(false);
      fixture.resourceRepository.findOne.mockResolvedValueOnce({ id: 10, supervisionMode: 'supervision_allowed' });
      const data = { payload: { uid: 'abc', resourceId: 10 } } as AttractapEvent['data'];

      await fixture.handler.handleCardAuthenticationRequest(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.CARD_AUTHENTICATION_DATA,
            payload: expect.objectContaining({ supervisionMode: 'supervision_allowed', requiresSupervisor: true }),
          }),
        }),
      );
    });
  });
}
