/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import {
  FormFieldType,
  effectiveFormFlags,
  ResourceFormAction,
  type FormFieldRecord,
  type FormRecord,
} from '@attraccess/application-models';
import { RESOURCE_FORM_STORE } from '../../../../resources/forms/forms-store.port';
import { ResourceFormsService } from '../../../../resources/forms/forms.service';
import { AttractapFormsHandler } from '../forms/forms.handler';
import { ReaderStartGate } from './reader-start-gate.service';
import { CardSessionService } from '../ui/card-session.service';
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

// ATT-545 regression (backend half): the Attractap form reopens after the last
// field only if the server re-sends RESOURCE_USAGE_FORM_REQUEST, i.e.
// ensureFormsSatisfied() finds the draft incomplete after every field was
// submitted. This replays the exact firmware message sequence (paged, one field
// per page, with the real ResourceFormsService) and asserts the server treats the
// draft as complete and does NOT re-request the form. The device-side guard
// against a *duplicate/retried* form request lives in the firmware (handleFormsRequest).

const makeField = (overrides: Partial<FormFieldRecord>): FormFieldRecord =>
  ({
    id: 1,
    formId: 1,
    name: 'Field',
    type: FormFieldType.TEXT,
    isRequired: false,
    description: null,
    options: null,
    position: 0,
    ...overrides,
  }) as FormFieldRecord;

describe('ATT-545 attractap paged form session flow (server does not re-request a completed form)', () => {
  const RESOURCE_ID = 5;
  const FORM_ID = 7;
  const ACTION = ResourceFormAction.START;

  const form: FormRecord = {
    id: FORM_ID,
    name: 'Safety',
    resourceId: RESOURCE_ID,
    isRequiredOnResourceUsageStart: true,
    isRequiredOnResourceUsageTakeOver: false,
    isRequiredOnResourceUsageEnd: false,
    fields: [
      makeField({ id: 11, name: 'Name', type: FormFieldType.TEXT, isRequired: true }),
      makeField({ id: 12, name: 'Age', type: FormFieldType.NUMBER, isRequired: false }),
      makeField({ id: 13, name: 'Confirm', type: FormFieldType.BOOLEAN, isRequired: true }),
      makeField({ id: 14, name: 'Color', type: FormFieldType.SELECT, isRequired: true, options: ['red', 'blue'] }),
    ],
  } as FormRecord;

  let formsHandler: AttractapFormsHandler;
  let sessionHandler: AttractapSessionHandler;
  let startSession: jest.Mock;
  let endSession: jest.Mock;
  let formStore: {
    resourceExists: jest.Mock;
    findRequiredForAction: jest.Mock;
    findApplicableForResource: jest.Mock;
    findForm: jest.Mock;
  };

  beforeEach(async () => {
    startSession = jest.fn().mockResolvedValue({ id: 999 });
    endSession = jest
      .fn()
      .mockResolvedValue({ id: 999, userId: 7, startTime: new Date(0), endTime: new Date(1426999) });
    form.isRequiredOnResourceUsageEnd = false;

    formStore = {
      resourceExists: jest.fn().mockResolvedValue(true),
      findRequiredForAction: jest.fn().mockResolvedValue([form]),
      // The forms the test requires reach the resource with their own flags (no overrides).
      findApplicableForResource: jest.fn(async () =>
        ((await formStore.findRequiredForAction()) as FormRecord[]).map((item) => ({
          form: item,
          groupName: null,
          override: null,
          disabled: false,
          effective: effectiveFormFlags(item, null),
        })),
      ),
      findForm: jest.fn().mockResolvedValue(form),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ResourceFormsService,
        AttractapFormsHandler,
        AttractapSessionHandler,
        { provide: RESOURCE_FORM_STORE, useValue: formStore },
        { provide: ResourceActionGuard, useValue: { validateResourceAction: jest.fn().mockResolvedValue(true) } },
        { provide: AttractapService, useValue: { findReaderById: jest.fn().mockResolvedValue(null) } },
        { provide: UsersService, useValue: { findOne: jest.fn().mockResolvedValue({ id: 7 }) } },
        { provide: ResourceUsageService, useValue: { startSession, endSession } },
        { provide: ResourceFlowsExecutorService, useValue: {} },
        { provide: SumUpService, useValue: { getIsEnabled: jest.fn().mockResolvedValue(false) } },
        { provide: BillingService, useValue: { getResourceUsageCharge: jest.fn().mockResolvedValue(null) } },
        { provide: ResourceListService, useValue: { sendResourceListToSocket: jest.fn() } },
        { provide: SupervisionService, useValue: { settleByCard: jest.fn() } },
        {
          provide: ReaderStartGate,
          useValue: { run: jest.fn().mockResolvedValue({ kind: 'proceed' }), afterStop: jest.fn() },
        },
        { provide: CardSessionService, useValue: new CardSessionService() },
        { provide: ResourceMeteringService, useValue: {} },
        { provide: ResourceOperatingAttributionService, useValue: {} },
      ],
    }).compile();

    formsHandler = moduleRef.get(AttractapFormsHandler);
    sessionHandler = moduleRef.get(AttractapSessionHandler);
  });

  function makeSocket() {
    return {
      id: 'sock-1',
      readerId: 42,
      state: { verifiedUserId: 7 },
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendBinaryData: jest.fn(),
    } as any;
  }

  const sentTypes = (socket: any) => socket.sendMessage.mock.calls.map((c: any[]) => c[0]?.data?.type);

  async function submitPage(socket: any, offset: number, answers: { fieldId: number; value: unknown }[]) {
    await formsHandler.handleResourceUsageFormSubmitPage(socket, {
      payload: { resourceId: RESOURCE_ID, action: ACTION, formId: FORM_ID, offset, answers },
    } as AttractapEvent['data']);
    const last = socket.sendMessage.mock.calls.at(-1)[0];
    expect(last.data.type).toBe(AttractapEventType.RESOURCE_USAGE_FORM_PAGE_RESULT);
    return last.data.payload as { valid: boolean; errors: unknown[] };
  }

  it('does NOT reopen the form after the last field is submitted', async () => {
    const socket = makeSocket();

    // 1) Firmware presses START -> backend finds empty draft -> FORM_REQUEST (form shown).
    await sessionHandler.handleStartResourceUsageSession(socket, {
      payload: { resourceId: RESOURCE_ID },
    } as AttractapEvent['data']);
    expect(sentTypes(socket)).toContain(AttractapEventType.RESOURCE_USAGE_FORM_REQUEST);

    // 2) Firmware walks the form one field per page, exactly like the device does.
    expect((await submitPage(socket, 0, [{ fieldId: 11, value: 'Alice' }])).valid).toBe(true); // text required
    expect((await submitPage(socket, 1, [])).valid).toBe(true); // optional number left empty -> no answer
    expect((await submitPage(socket, 2, [{ fieldId: 13, value: true }])).valid).toBe(true); // boolean required
    expect((await submitPage(socket, 3, [{ fieldId: 14, value: 'red' }])).valid).toBe(true); // select required

    // 3) Firmware finishes the form and presses START again.
    socket.sendMessage.mockClear();
    await sessionHandler.handleStartResourceUsageSession(socket, {
      payload: { resourceId: RESOURCE_ID },
    } as AttractapEvent['data']);

    // The bug: a second FORM_REQUEST is sent, reopening the form from the beginning.
    expect(sentTypes(socket)).not.toContain(AttractapEventType.RESOURCE_USAGE_FORM_REQUEST);
    expect(startSession).toHaveBeenCalledTimes(1);
    expect(sentTypes(socket)).toContain(AttractapEventType.START_RESOURCE_USAGE_SESSION);
  });

  it('returns elapsed duration only after the required end form is complete', async () => {
    form.isRequiredOnResourceUsageEnd = true;
    const socket = makeSocket();
    const request = { payload: { resourceId: RESOURCE_ID, requestId: 17 } } as AttractapEvent['data'];
    await sessionHandler.handleStopResourceUsageSession(socket, request);
    expect(endSession).not.toHaveBeenCalled();
    expect(sentTypes(socket)).toContain(AttractapEventType.RESOURCE_USAGE_FORM_REQUEST);
    for (const [offset, answers] of [
      [0, [{ fieldId: 11, value: 'Alice' }]],
      [1, []],
      [2, [{ fieldId: 13, value: true }]],
      [3, [{ fieldId: 14, value: 'red' }]],
    ] as const) {
      await formsHandler.handleResourceUsageFormSubmitPage(socket, {
        payload: {
          resourceId: RESOURCE_ID,
          requestId: 17,
          action: ResourceFormAction.END,
          formId: FORM_ID,
          offset,
          answers,
        },
      } as unknown as AttractapEvent['data']);
    }
    socket.sendMessage.mockClear();
    await sessionHandler.handleStopResourceUsageSession(socket, request);
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(socket.sendMessage.mock.calls.at(-1)[0].data.payload).toEqual({
      success: true,
      requestId: 17,
      endedOwnSession: true,
      durationSeconds: 1426,
    });
    expect(sentTypes(socket)).not.toContain(AttractapEventType.RESOURCE_USAGE_FORM_REQUEST);
  });

  it('starts with an empty form after cancellation', async () => {
    const socket = makeSocket();

    await sessionHandler.handleStartResourceUsageSession(socket, {
      payload: { resourceId: RESOURCE_ID },
    } as AttractapEvent['data']);
    expect((await submitPage(socket, 0, [{ fieldId: 11, value: 'Alice' }])).valid).toBe(true);

    formsHandler.handleResourceUsageFormCancel(socket, {
      payload: { resourceId: RESOURCE_ID, action: ACTION },
    } as AttractapEvent['data']);

    socket.sendMessage.mockClear();
    await sessionHandler.handleStartResourceUsageSession(socket, {
      payload: { resourceId: RESOURCE_ID },
    } as AttractapEvent['data']);

    expect(sentTypes(socket)).toContain(AttractapEventType.RESOURCE_USAGE_FORM_REQUEST);
  });

  it('asks for five inherited forms in batches of four and starts only when all are answered (ATT-796)', async () => {
    const inherited: FormRecord[] = [1, 2, 3, 4, 5].map(
      (n) =>
        ({
          id: 100 + n,
          name: `Inherited ${n}`,
          scope: n === 5 ? 'group' : 'global',
          resourceId: null,
          groupId: n === 5 ? 3 : null,
          deletedAt: null,
          isRequiredOnResourceUsageStart: true,
          isRequiredOnResourceUsageTakeOver: false,
          isRequiredOnResourceUsageEnd: false,
          fields: [makeField({ id: 1000 + n, formId: 100 + n, name: `Q${n}`, isRequired: true })],
        }) as FormRecord,
    );
    formStore.findRequiredForAction.mockResolvedValue(inherited);
    const socket = makeSocket();
    const start = () =>
      sessionHandler.handleStartResourceUsageSession(socket, {
        payload: { resourceId: RESOURCE_ID },
      } as AttractapEvent['data']);
    const requested = () =>
      socket.sendMessage.mock.calls
        .map((call: any[]) => call[0].data)
        .filter((data: any) => data.type === AttractapEventType.RESOURCE_USAGE_FORM_REQUEST)
        .map((data: any) => data.payload.forms.map((form: { id: number }) => form.id));
    const answer = async (n: number) => {
      await formsHandler.handleResourceUsageFormGetFields(socket, {
        payload: { resourceId: RESOURCE_ID, action: ACTION, formId: 100 + n, offset: 0, limit: 1 },
      } as AttractapEvent['data']);
      const fields = socket.sendMessage.mock.calls.at(-1)[0].data;
      expect(fields.type).toBe(AttractapEventType.RESOURCE_USAGE_FORM_FIELDS);
      expect(fields.payload.fields.map((field: { id: number }) => field.id)).toEqual([1000 + n]);
      await formsHandler.handleResourceUsageFormSubmitPage(socket, {
        payload: {
          resourceId: RESOURCE_ID,
          action: ACTION,
          formId: 100 + n,
          offset: 0,
          answers: [{ fieldId: 1000 + n, value: `A${n}` }],
        },
      } as AttractapEvent['data']);
      expect(socket.sendMessage.mock.calls.at(-1)[0].data.payload.valid).toBe(true);
    };

    await start();
    expect(requested()).toEqual([[101, 102, 103, 104]]);
    for (const n of [1, 2, 3, 4]) await answer(n);

    await start();
    expect(requested()).toEqual([[101, 102, 103, 104], [105]]);
    expect(startSession).not.toHaveBeenCalled();

    await answer(5);
    await start();
    expect(requested()).toHaveLength(2);
    expect(startSession).toHaveBeenCalledTimes(1);
    // Every batch's answers reach the session, not only the last batch's.
    expect(startSession.mock.calls[0][2].formSubmissions).toEqual(
      [1, 2, 3, 4, 5].map((n) => ({ formId: 100 + n, answers: [{ fieldId: 1000 + n, value: `A${n}` }] })),
    );
    expect(sentTypes(socket)).toContain(AttractapEventType.START_RESOURCE_USAGE_SESSION);
  });
});
