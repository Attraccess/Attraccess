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
import { FORM_IMAGE_STORE } from '../../../../resources/forms/images/form-image-store.port';
import { InMemoryFormImageStore } from '../../../../resources/forms/images/form-image-store.test-fixture';
import { FormImageHandoffService } from '../../../../resources/forms/images/form-image-handoff.service';
import { ReaderFormImages } from '../forms/reader-form-images.service';
import { ResourceFormsService } from '../../../../resources/forms/forms.service';
import { AttractapFormsHandler } from '../forms/forms.handler';
import { ReaderStartGate } from './reader-start-gate.service';
import { CardSessionService } from '../ui/card-session.service';
import { AttractapSessionHandler } from './session.handler';
import { SessionEndMaintenanceRequests } from '../../../../resources/usage/sessions/session-end-maintenance-requests';
import { MaintenanceRequestService } from '../../../../resources/maintenances/maintenance-request.service';
import { LicenseService } from '../../../../license/license.service';
import { MachineBusyError } from '../../../../resources/usage/errors/machine-busy.error';
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
  let createRequest: jest.Mock;
  let imageStore: InMemoryFormImageStore;
  let handoffs: {
    canIssue: jest.Mock;
    openForReader: jest.Mock;
    imageIds: jest.Mock;
    endForReader: jest.Mock;
  };
  let formStore: {
    resourceExists: jest.Mock;
    findRequiredForAction: jest.Mock;
    findApplicableForResource: jest.Mock;
    findForm: jest.Mock;
  };

  beforeEach(async () => {
    startSession = jest.fn().mockResolvedValue({ id: 999 });
    createRequest = jest.fn().mockResolvedValue({ id: 1 });
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

    imageStore = new InMemoryFormImageStore();
    handoffs = {
      canIssue: jest.fn().mockResolvedValue(true),
      openForReader: jest.fn(async () => ({
        handoffId: 'handoff-1',
        token: 'token-1',
        handoffUrl: 'https://app.example/form-photo/token-1',
        imageCount: (await imageStore.listHandoffImages('handoff-1')).length,
        maxImages: 2,
      })),
      imageIds: jest.fn(async (id: string) => (await imageStore.listHandoffImages(id)).map((image) => image.id)),
      endForReader: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ResourceFormsService,
        AttractapFormsHandler,
        ReaderFormImages,
        { provide: FORM_IMAGE_STORE, useValue: imageStore },
        { provide: FormImageHandoffService, useValue: handoffs },
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
        SessionEndMaintenanceRequests,
        { provide: MaintenanceRequestService, useValue: { createRequest } },
        { provide: LicenseService, useValue: { verifyLicense: jest.fn().mockResolvedValue({}) } },
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

  it('files exactly one maintenance request for a stop that goes through end forms and a busy retry', async () => {
    form.isRequiredOnResourceUsageEnd = true;
    endSession.mockRejectedValueOnce(new MachineBusyError());
    const socket = makeSocket();
    // The reader resends the stored answer with every STOP of this stop.
    const request = {
      payload: { resourceId: RESOURCE_ID, requestId: 17, maintenanceRequest: { reason: 'Blade is dull' } },
    } as unknown as AttractapEvent['data'];

    await sessionHandler.handleStopResourceUsageSession(socket, request);
    expect(createRequest).not.toHaveBeenCalled(); // only the end forms were requested
    for (const [offset, answers] of [
      [0, [{ fieldId: 11, value: 'Alice' }]],
      [1, []],
      [2, [{ fieldId: 13, value: true }]],
      [3, [{ fieldId: 14, value: 'red' }]],
    ] as const) {
      await formsHandler.handleResourceUsageFormSubmitPage(socket, {
        payload: { resourceId: RESOURCE_ID, action: ResourceFormAction.END, formId: FORM_ID, offset, answers },
      } as unknown as AttractapEvent['data']);
    }

    await sessionHandler.handleStopResourceUsageSession(socket, request); // refused: the machine is busy
    expect(createRequest).not.toHaveBeenCalled();
    expect(socket.sendMessage.mock.calls.at(-1)[0].data.payload).toHaveProperty('error');

    await sessionHandler.handleStopResourceUsageSession(socket, request);
    expect(createRequest).toHaveBeenCalledTimes(1);
    expect(createRequest).toHaveBeenCalledWith(RESOURCE_ID, 7, 'Blade is dull');
    expect(socket.sendMessage.mock.calls.at(-1)[0].data.payload).toMatchObject({
      success: true,
      maintenanceRequestFiled: true,
    });
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
  describe('image fields (ATT-879)', () => {
    const IMAGE_FIELD = 15;
    const PHOTO = '3f2b6c1e-8a4d-4b7e-9c11-2d5e7f8a9b01';
    const imageForm = (required: boolean): FormRecord =>
      ({
        ...form,
        fields: [
          makeField({ id: 11, name: 'Name', type: FormFieldType.TEXT, isRequired: true }),
          makeField({
            id: IMAGE_FIELD,
            name: 'Photo',
            type: FormFieldType.IMAGE,
            isRequired: required,
            options: { maxImages: 2 },
            position: 1,
          }),
        ],
      }) as FormRecord;
    const photoSocket = (formImages: boolean) => {
      const socket = makeSocket();
      socket.state.formImages = formImages;
      return socket;
    };
    const start = (socket: any) =>
      sessionHandler.handleStartResourceUsageSession(socket, {
        payload: { resourceId: RESOURCE_ID },
      } as AttractapEvent['data']);
    const fieldsWindow = async (socket: any) => {
      await formsHandler.handleResourceUsageFormGetFields(socket, {
        payload: { resourceId: RESOURCE_ID, action: ACTION, formId: FORM_ID, offset: 0, limit: 5 },
      } as AttractapEvent['data']);
      return socket.sendMessage.mock.calls.at(-1)[0].data.payload;
    };
    const phoneUploads = async (id = PHOTO) => {
      await imageStore.insertImage({
        id,
        userId: 7,
        uploadedByUserId: null,
        handoffId: 'handoff-1',
        formId: FORM_ID,
        fieldId: IMAGE_FIELD,
        mimeType: 'image/jpeg',
        size: 1,
        width: 1,
        height: 1,
        filename: `${id}.jpg`,
      });
    };
    const requestedForms = (socket: any) =>
      socket.sendMessage.mock.calls
        .map((call: any[]) => call[0].data)
        .filter((data: any) => data.type === AttractapEventType.RESOURCE_USAGE_FORM_REQUEST)
        .map((data: any) => data.payload.forms);

    describe('on a reader without the formImages capability', () => {
      it('leaves an optional image field out of the form and the field count', async () => {
        formStore.findRequiredForAction.mockResolvedValue([imageForm(false)]);
        const socket = photoSocket(false);

        await start(socket);

        expect(requestedForms(socket)).toEqual([[{ id: FORM_ID, name: 'Safety', fieldCount: 1 }]]);
        const window = await fieldsWindow(socket);
        expect(window.totalFieldCount).toBe(1);
        expect(window.fields.map((field: any) => field.type)).toEqual(['text']);
        expect(handoffs.openForReader).not.toHaveBeenCalled();
      });

      it('completes the form without the optional image and sends an empty answer for it', async () => {
        formStore.findRequiredForAction.mockResolvedValue([imageForm(false)]);
        const socket = photoSocket(false);
        await start(socket);
        await formsHandler.handleResourceUsageFormSubmitPage(socket, {
          payload: {
            resourceId: RESOURCE_ID,
            action: ACTION,
            formId: FORM_ID,
            offset: 0,
            answers: [{ fieldId: 11, value: 'Alice' }],
          },
        } as AttractapEvent['data']);

        await start(socket);

        expect(startSession).toHaveBeenCalledTimes(1);
        expect(startSession.mock.calls[0][2].formSubmissions).toEqual([
          { formId: FORM_ID, answers: [{ fieldId: 11, value: 'Alice' }] },
        ]);
      });

      it.each([
        ['START', { resourceId: RESOURCE_ID }, false, 'de', 'Formular mit Foto bitte in der Web-App ausfüllen.'],
        [
          'TAKEOVER',
          { resourceId: RESOURCE_ID, forceTakeOver: true },
          false,
          'en',
          'Please complete this form in the web app.',
        ],
        ['END', { resourceId: RESOURCE_ID }, true, 'de', 'Formular mit Foto bitte in der Web-App ausfüllen.'],
      ])(
        'refuses %s with a required image field in the reader language, and sends no form',
        async (_action, payload, stop, language, body) => {
          const everyAction = { isRequiredOnResourceUsageTakeOver: true, isRequiredOnResourceUsageEnd: true };
          formStore.findRequiredForAction.mockResolvedValue([{ ...imageForm(true), ...everyAction }]);
          const socket = photoSocket(false);
          socket.state.cardSession = { id: 'card-1', userId: 7, language, issuedAt: 0, expiryTimer: null };
          const type = stop
            ? AttractapEventType.STOP_RESOURCE_USAGE_SESSION
            : AttractapEventType.START_RESOURCE_USAGE_SESSION;

          await (
            stop ? sessionHandler.handleStopResourceUsageSession : sessionHandler.handleStartResourceUsageSession
          ).call(sessionHandler, socket, { type, payload } as AttractapEvent['data']);

          expect(sentTypes(socket)).not.toContain(AttractapEventType.RESOURCE_USAGE_FORM_REQUEST);
          const reply = socket.sendMessage.mock.calls.at(-1)[0].data;
          expect(reply.type).toBe(type);
          expect(reply.payload).toMatchObject({
            error: 'START_BLOCKED',
            reason: { code: 'FORM_PHOTO_UNSUPPORTED', body },
          });
          expect(startSession).not.toHaveBeenCalled();
          expect(endSession).not.toHaveBeenCalled();
        },
      );

      it('also refuses when the app URL is not set, because no link can be built', async () => {
        formStore.findRequiredForAction.mockResolvedValue([imageForm(true)]);
        handoffs.canIssue.mockResolvedValue(false);

        const socket = photoSocket(true);
        await start(socket);

        expect(socket.sendMessage.mock.calls.at(-1)[0].data.payload).toMatchObject({ error: 'START_BLOCKED' });
      });
    });

    describe('on a reader with the formImages capability', () => {
      beforeEach(() => formStore.findRequiredForAction.mockResolvedValue([imageForm(true)]));

      it('sends the image field with the link, the count and the limit, and no value', async () => {
        const socket = photoSocket(true);
        await start(socket);
        expect(requestedForms(socket)).toEqual([[{ id: FORM_ID, name: 'Safety', fieldCount: 2 }]]);

        const window = await fieldsWindow(socket);

        expect(window.fields[1]).toEqual({
          id: IMAGE_FIELD,
          name: 'Photo',
          description: null,
          type: 'image',
          isRequired: true,
          options: { maxImages: 2 },
          value: null,
          handoffUrl: 'https://app.example/form-photo/token-1',
          imageCount: 0,
          maxImages: 2,
        });
        expect(handoffs.openForReader).toHaveBeenCalledWith(
          { readerId: 42, userId: 7, resourceId: RESOURCE_ID, action: ACTION, formId: FORM_ID, fieldId: IMAGE_FIELD },
          { maxImages: 2 },
          undefined,
        );
      });

      it('shows the live count when the reader asks again, with the same link', async () => {
        const socket = photoSocket(true);
        await start(socket);
        await fieldsWindow(socket);
        await phoneUploads();

        const window = await fieldsWindow(socket);

        expect(window.fields[1]).toMatchObject({ imageCount: 1, handoffUrl: 'https://app.example/form-photo/token-1' });
        expect(handoffs.openForReader.mock.calls[1][2]).toEqual({ handoffId: 'handoff-1', token: 'token-1' });
      });

      it('answers the page with the image ids the server knows, whatever the reader sent', async () => {
        const socket = photoSocket(true);
        await start(socket);
        await fieldsWindow(socket);
        await phoneUploads();

        const result = await submitPage(socket, 0, [
          { fieldId: 11, value: 'Alice' },
          { fieldId: IMAGE_FIELD, value: 'ignored by the server' },
        ]);

        expect(result).toEqual(expect.objectContaining({ valid: true }));
        expect(socket.state.formDrafts[`${RESOURCE_ID}:${ACTION}`]).toEqual({
          11: 'Alice',
          [IMAGE_FIELD]: JSON.stringify([PHOTO]),
        });
        await start(socket);
        expect(startSession.mock.calls[0][2].formSubmissions).toEqual([
          {
            formId: FORM_ID,
            answers: [
              { fieldId: 11, value: 'Alice' },
              { fieldId: IMAGE_FIELD, value: JSON.stringify([PHOTO]) },
            ],
          },
        ]);
      });

      it('gives REQUIRED_FIELD on the page while the phone has added no photo', async () => {
        const socket = photoSocket(true);
        await start(socket);
        await fieldsWindow(socket);

        const result = await submitPage(socket, 0, [
          { fieldId: 11, value: 'Alice' },
          { fieldId: IMAGE_FIELD, value: '' },
        ]);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual([expect.objectContaining({ fieldId: IMAGE_FIELD, code: 'REQUIRED_FIELD' })]);
        expect(socket.state.formDrafts).toBeUndefined();
      });

      it('rejects an image that another user uploaded', async () => {
        const socket = photoSocket(true);
        await start(socket);
        await fieldsWindow(socket);
        await phoneUploads();
        (imageStore.images.get(PHOTO) as { userId: number }).userId = 8;

        const result = await submitPage(socket, 0, [{ fieldId: IMAGE_FIELD, value: '' }]);

        expect(result.valid).toBe(false);
      });

      it('asks for the form again when the phone removed the photo after the page was accepted', async () => {
        const socket = photoSocket(true);
        await start(socket);
        await fieldsWindow(socket);
        await phoneUploads();
        await submitPage(socket, 0, [
          { fieldId: 11, value: 'Alice' },
          { fieldId: IMAGE_FIELD, value: '' },
        ]);
        imageStore.images.clear();
        socket.sendMessage.mockClear();

        await start(socket);

        expect(sentTypes(socket)).toContain(AttractapEventType.RESOURCE_USAGE_FORM_REQUEST);
        expect(startSession).not.toHaveBeenCalled();
      });

      it('ends the phone links when the form is cancelled', async () => {
        const socket = photoSocket(true);
        await start(socket);
        await fieldsWindow(socket);

        formsHandler.handleResourceUsageFormCancel(socket, {
          payload: { resourceId: RESOURCE_ID, action: ACTION },
        } as AttractapEvent['data']);

        expect(handoffs.endForReader).toHaveBeenCalledWith(42, { resourceId: RESOURCE_ID, action: ACTION });
        expect(socket.state.formHandoffs).toEqual({});
      });
    });
  });
});
