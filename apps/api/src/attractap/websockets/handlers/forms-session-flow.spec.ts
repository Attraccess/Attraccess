/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Form,
  FormField,
  FormFieldType,
  FormSubmission,
  Resource,
  ResourceFormAction,
} from '@attraccess/database-entities';
import { ResourceFormsService } from '../../../resources/forms/forms.service';
import { AttractapFormsHandler } from './forms.handler';
import { AttractapSessionHandler } from './session.handler';
import { ResourceActionGuard } from './resource-action.guard';
import { AttractapService } from '../../attractap.service';
import { UsersService } from '../../../users-and-auth/users/users.service';
import { ResourceUsageService } from '../../../resources/usage/resourceUsage.service';
import { ResourceFlowsExecutorService } from '../../../resources/flows/resource-flows-executor.service';
import { SumUpService } from '../../../billing/sumup.service';
import { ResourceListService } from './resource-list.service';
import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { SupervisionService } from '../../../resources/supervision/supervision.service';

// ATT-545 regression (backend half): the Attractap form reopens after the last
// field only if the server re-sends RESOURCE_USAGE_FORM_REQUEST, i.e.
// ensureFormsSatisfied() finds the draft incomplete after every field was
// submitted. This replays the exact firmware message sequence (paged, one field
// per page, with the real ResourceFormsService) and asserts the server treats the
// draft as complete and does NOT re-request the form. The device-side guard
// against a *duplicate/retried* form request lives in the firmware (handleFormsRequest).

const makeField = (overrides: Partial<FormField>): FormField =>
  ({
    id: 1,
    formId: 1,
    name: 'Field',
    type: FormFieldType.TEXT,
    isRequired: false,
    description: null,
    options: null,
    ...overrides,
  }) as FormField;

describe('ATT-545 attractap paged form session flow (server does not re-request a completed form)', () => {
  const RESOURCE_ID = 5;
  const FORM_ID = 7;
  const ACTION = ResourceFormAction.START;

  const form: Form = {
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
  } as Form;

  let formsHandler: AttractapFormsHandler;
  let sessionHandler: AttractapSessionHandler;
  let startSession: jest.Mock;

  beforeEach(async () => {
    startSession = jest.fn().mockResolvedValue({ id: 999 });

    const formRepo = { find: jest.fn().mockResolvedValue([form]), findOne: jest.fn().mockResolvedValue(form) };
    const resourceRepo = { findOne: jest.fn().mockResolvedValue({ id: RESOURCE_ID } as Resource) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ResourceFormsService,
        AttractapFormsHandler,
        AttractapSessionHandler,
        { provide: getRepositoryToken(Form), useValue: formRepo },
        { provide: getRepositoryToken(FormField), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(FormSubmission), useValue: { save: jest.fn() } },
        { provide: getRepositoryToken(Resource), useValue: resourceRepo },
        { provide: ResourceActionGuard, useValue: { validateResourceAction: jest.fn().mockResolvedValue(true) } },
        { provide: AttractapService, useValue: { findReaderById: jest.fn().mockResolvedValue(null) } },
        { provide: UsersService, useValue: { findOne: jest.fn().mockResolvedValue({ id: 7 }) } },
        { provide: ResourceUsageService, useValue: { startSession } },
        { provide: ResourceFlowsExecutorService, useValue: {} },
        { provide: SumUpService, useValue: { getIsEnabled: jest.fn().mockResolvedValue(false) } },
        { provide: ResourceListService, useValue: { sendResourceListToSocket: jest.fn() } },
        { provide: SupervisionService, useValue: { settleByCard: jest.fn() } },
      ],
    }).compile();

    formsHandler = moduleRef.get(AttractapFormsHandler);
    sessionHandler = moduleRef.get(AttractapSessionHandler);
  });

  function makeSocket() {
    return {
      id: 'sock-1',
      readerId: 42,
      state: { lastAuthenticatedUserId: 7 },
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
});
