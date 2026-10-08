/* eslint-disable @typescript-eslint/no-explicit-any */

import { AttractapEvent, AttractapEventType } from './../websocket.types';

import { resetTestFixture } from './card.handler.setup.test-fixture';

import { createAttractapCardHandlerFixture } from './card.handler.spec.createAttractapCardHandlerFixture.test-fixture';

import { createHandleCardAuthenticationRequestFixture } from './card.handler.spec.createHandleCardAuthenticationRequestFixture.test-fixture';

export type AttractapCardHandlerTestScope = ReturnType<typeof createAttractapCardHandlerFixture>;

export type HandleCardAuthenticationRequestTestScope = ReturnType<typeof createHandleCardAuthenticationRequestFixture>;

describe('AttractapCardHandler', () => {
  const scope = createAttractapCardHandlerFixture();

  beforeEach(() => {
    resetTestFixture(scope);
  });

  describe('handleCardAuthenticationRequest', () => {
    const handleCardAuthenticationRequestScope = createHandleCardAuthenticationRequestFixture(scope);

    it.each(['pending', 'failed'])('authenticates while the supplemental resource list is %s', async (state) => {
      const socket = handleCardAuthenticationRequestScope.createMockSocket();
      const failure = new Error('Resource list unavailable');
      handleCardAuthenticationRequestScope.attractapService.getNFCCardByUID.mockResolvedValueOnce(
        handleCardAuthenticationRequestScope.activeCard,
      );
      (
        handleCardAuthenticationRequestScope.handler as any
      ).resourceListService.sendResourceListToSocket.mockImplementation(() =>
        state === 'pending' ? new Promise(() => undefined) : Promise.reject(failure),
      );

      await handleCardAuthenticationRequestScope.handler.handleCardAuthenticationRequest(socket, {
        payload: { uid: 'abc', resourceId: 10 },
      } as AttractapEvent['data']);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.CARD_AUTHENTICATION_DATA,
            payload: expect.objectContaining({
              key: handleCardAuthenticationRequestScope.activeCard.key,
              username: handleCardAuthenticationRequestScope.activeCard.user.username,
            }),
          }),
        }),
      );
      if (state === 'failed')
        expect((handleCardAuthenticationRequestScope.handler as any).logger.error).toHaveBeenCalledWith(
          expect.any(String),
          failure,
        );
    });

    it('always increments attractapNfcTapsTotal', async () => {
      const socket = handleCardAuthenticationRequestScope.createMockSocket();
      const data = { payload: { uid: '', resourceId: 10 } } as AttractapEvent['data'];

      await handleCardAuthenticationRequestScope.handler.handleCardAuthenticationRequest(socket, data);

      expect(handleCardAuthenticationRequestScope.metricsService.attractapNfcTapsTotal.inc).toHaveBeenCalledTimes(1);
    });

    it('sends INVALID_UID when uid is invalid', async () => {
      const socket = handleCardAuthenticationRequestScope.createMockSocket();
      const data = { payload: { uid: '', resourceId: 10 } } as AttractapEvent['data'];

      await handleCardAuthenticationRequestScope.handler.handleCardAuthenticationRequest(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.CARD_AUTHENTICATION_DATA,
            payload: { error: 'INVALID_UID' },
          }),
        }),
      );
      expect(handleCardAuthenticationRequestScope.attractapService.getNFCCardByUID).not.toHaveBeenCalled();
    });

    it('sends CARD_NOT_FOUND when the card does not exist', async () => {
      const socket = handleCardAuthenticationRequestScope.createMockSocket();
      handleCardAuthenticationRequestScope.attractapService.getNFCCardByUID.mockResolvedValueOnce(null);
      const data = { payload: { uid: 'abc', resourceId: 10 } } as AttractapEvent['data'];

      await handleCardAuthenticationRequestScope.handler.handleCardAuthenticationRequest(socket, data);

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
      const socket = handleCardAuthenticationRequestScope.createMockSocket();
      handleCardAuthenticationRequestScope.attractapService.getNFCCardByUID.mockResolvedValueOnce({
        ...handleCardAuthenticationRequestScope.activeCard,
        isActive: false,
      });
      const data = { payload: { uid: 'abc', resourceId: 10 } } as AttractapEvent['data'];

      await handleCardAuthenticationRequestScope.handler.handleCardAuthenticationRequest(socket, data);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.CARD_AUTHENTICATION_DATA,
            payload: { error: 'CARD_NOT_ACTIVE' },
          }),
        }),
      );
      expect(handleCardAuthenticationRequestScope.resourceUsageService.canControllResource).not.toHaveBeenCalled();
    });

    it('sets lastAuthenticatedUserId and sends CARD_AUTHENTICATION_DATA on success', async () => {
      const socket = handleCardAuthenticationRequestScope.createMockSocket();
      handleCardAuthenticationRequestScope.attractapService.getNFCCardByUID.mockResolvedValueOnce(
        handleCardAuthenticationRequestScope.activeCard,
      );
      handleCardAuthenticationRequestScope.resourceUsageService.canControllResource.mockResolvedValueOnce(true);
      handleCardAuthenticationRequestScope.resourceIntroducersService.isIntroducer.mockResolvedValueOnce(true);
      handleCardAuthenticationRequestScope.rbacService.getEffectivePermissions.mockResolvedValueOnce(
        new Set(['resources.update']),
      );
      const data = { payload: { uid: 'abc', resourceId: 10 } } as AttractapEvent['data'];

      await handleCardAuthenticationRequestScope.handler.handleCardAuthenticationRequest(socket, data);

      expect(socket.state.lastAuthenticatedUserId).toBe(handleCardAuthenticationRequestScope.activeCard.user.id);
      expect(handleCardAuthenticationRequestScope.resourceUsageService.canControllResource).toHaveBeenCalledWith(
        10,
        handleCardAuthenticationRequestScope.activeCard.user,
      );
      expect(handleCardAuthenticationRequestScope.resourceIntroducersService.isIntroducer).toHaveBeenCalledWith(
        10,
        handleCardAuthenticationRequestScope.activeCard.user.id,
        true,
      );
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.CARD_AUTHENTICATION_DATA,
            payload: {
              keyNo: handleCardAuthenticationRequestScope.activeCard.keyNo,
              key: handleCardAuthenticationRequestScope.activeCard.key,
              username: handleCardAuthenticationRequestScope.activeCard.user.username,
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
      const socket = handleCardAuthenticationRequestScope.createMockSocket();
      handleCardAuthenticationRequestScope.attractapService.getNFCCardByUID.mockResolvedValueOnce(
        handleCardAuthenticationRequestScope.activeCard,
      );
      handleCardAuthenticationRequestScope.resourceUsageService.canControllResource.mockResolvedValueOnce(true);
      handleCardAuthenticationRequestScope.resourceIntroducersService.isIntroducer.mockResolvedValueOnce(false);
      handleCardAuthenticationRequestScope.resourceRepository.findOne.mockResolvedValueOnce({
        id: 10,
        supervisionMode: 'supervision_required',
      });
      const data = { payload: { uid: 'abc', resourceId: 10 } } as AttractapEvent['data'];

      await handleCardAuthenticationRequestScope.handler.handleCardAuthenticationRequest(socket, data);

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
      const socket = handleCardAuthenticationRequestScope.createMockSocket();
      handleCardAuthenticationRequestScope.attractapService.getNFCCardByUID.mockResolvedValueOnce(
        handleCardAuthenticationRequestScope.activeCard,
      );
      handleCardAuthenticationRequestScope.resourceUsageService.canControllResource.mockResolvedValueOnce(false);
      handleCardAuthenticationRequestScope.resourceIntroducersService.isIntroducer.mockResolvedValueOnce(false);
      handleCardAuthenticationRequestScope.resourceRepository.findOne.mockResolvedValueOnce({
        id: 10,
        supervisionMode: 'supervision_allowed',
      });
      const data = { payload: { uid: 'abc', resourceId: 10 } } as AttractapEvent['data'];

      await handleCardAuthenticationRequestScope.handler.handleCardAuthenticationRequest(socket, data);

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
});
