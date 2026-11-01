/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { AttractapFormsHandler } from '../forms/forms.handler';
import { AttractapSessionHandler } from './session.handler';
import { ResourceActionGuard } from '../resource-action.guard';
import { AttractapService } from '../../../attractap.service';
import { UsersService } from '../../../../users-and-auth/users/users.service';
import { ResourceUsageService } from '../../../../resources/usage/sessions/resource-usage.service';
import { ResourceFlowsExecutorService } from '../../../../resources/flows/execution/resource-flows-executor.service';
import { SumUpService } from '../../../../billing/sumup/sumup.service';
import { BillingService } from '../../../../billing/charges/billing.service';
import { ResourceListService } from '../resource-list/resource-list.service';
import { AttractapEvent, AttractapEventType } from '../../websocket.types';
import { SupervisionService } from '../../../../resources/supervision/supervision.service';
import { ResourceMeteringService } from '../../../../resources/metering/resource-metering.service';
import { ResourceOperatingAttributionService } from '../../../../resources/operating-intervals/resource-operating-attribution.service';
import { ReaderStartGate } from './reader-start-gate.service';
import { CardSessionService } from '../ui/card-session.service';
import { NoOwnActiveSessionError } from '../../../../resources/usage/errors/no-own-active-session.error';

// Lite long tap and the plain Stop button send no usageId: on a shared machine they may only end the card
// holder's own session. The reader maps the error code to its own wording.
describe('AttractapSessionHandler stop on a machine shared by several people', () => {
  let handler: AttractapSessionHandler;
  let endSession: jest.Mock;
  let getResourceUsageCharge: jest.Mock;

  beforeEach(async () => {
    endSession = jest.fn();
    getResourceUsageCharge = jest.fn().mockResolvedValue(null);
    const moduleRef = await Test.createTestingModule({
      providers: [
        AttractapSessionHandler,
        {
          provide: AttractapFormsHandler,
          useValue: { ensureFormsSatisfied: jest.fn().mockResolvedValue([]), clearFormDraft: jest.fn() },
        },
        { provide: ResourceActionGuard, useValue: { validateResourceAction: jest.fn().mockResolvedValue(true) } },
        { provide: AttractapService, useValue: {} },
        { provide: UsersService, useValue: { findOne: jest.fn().mockResolvedValue({ id: 7, username: 'holder' }) } },
        { provide: ResourceUsageService, useValue: { endSession } },
        { provide: ResourceFlowsExecutorService, useValue: {} },
        { provide: SumUpService, useValue: {} },
        { provide: BillingService, useValue: { getResourceUsageCharge } },
        { provide: ResourceListService, useValue: { sendResourceListToSocket: jest.fn() } },
        { provide: SupervisionService, useValue: {} },
        {
          provide: ReaderStartGate,
          useValue: { run: jest.fn().mockResolvedValue({ kind: 'proceed' }), afterStop: jest.fn() },
        },
        { provide: CardSessionService, useValue: new CardSessionService() },
        { provide: ResourceMeteringService, useValue: {} },
        { provide: ResourceOperatingAttributionService, useValue: {} },
      ],
    }).compile();
    handler = moduleRef.get(AttractapSessionHandler);
  });

  const makeSocket = () =>
    ({
      id: 'sock-1',
      readerId: 42,
      state: { lastAuthenticatedUserId: 7 },
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendBinaryData: jest.fn(),
    }) as any;
  const stop = (socket: any, payload: object) =>
    handler.handleStopResourceUsageSession(socket, { payload: { resourceId: 10, requestId: 3, ...payload } } as any);
  const reply = (socket: any) => socket.sendMessage.mock.calls.at(-1)[0] as AttractapEvent;

  it('relays NoOwnActiveSessionError when the card holder has no session of their own', async () => {
    endSession.mockRejectedValue(new NoOwnActiveSessionError());
    const socket = makeSocket();

    await stop(socket, {});

    expect(endSession).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ id: 7 }),
      expect.not.objectContaining({ usageId: expect.anything() }),
      expect.anything(),
    );
    expect(reply(socket).data).toMatchObject({
      type: AttractapEventType.STOP_RESOURCE_USAGE_SESSION,
      payload: { error: 'NoOwnActiveSessionError', requestId: 3 },
    });
    expect(reply(socket).data.payload).not.toHaveProperty('success');
  });

  it('reports a chosen session of somebody else as not the holder own one, without their charge', async () => {
    endSession.mockResolvedValue({ id: 55, userId: 9, startTime: new Date(0), endTime: new Date(60_000) });
    const socket = makeSocket();

    await stop(socket, { usageId: 55 });

    expect(endSession).toHaveBeenCalledWith(10, expect.anything(), expect.objectContaining({ usageId: 55 }), {
      auditOrigin: { actorId: 7, authenticationMethod: null },
    });
    expect(reply(socket).data.payload).toMatchObject({ success: true, endedOwnSession: false, durationSeconds: 60 });
    expect(reply(socket).data.payload).not.toHaveProperty('billingSummary');
    expect(getResourceUsageCharge).not.toHaveBeenCalled();
  });
});
