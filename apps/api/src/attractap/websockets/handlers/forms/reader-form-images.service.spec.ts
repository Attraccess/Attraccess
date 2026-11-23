/* eslint-disable @typescript-eslint/no-explicit-any */
import { FormFieldType, ResourceFormAction } from '@attraccess/application-models';
import { ReaderFormImages } from './reader-form-images.service';

const field = (id: number, type: FormFieldType, isRequired = false) =>
  ({
    id,
    name: `F${id}`,
    type,
    isRequired,
    description: null,
    options: type === 'image' ? { maxImages: 2 } : null,
    position: id,
  }) as any;
const form = (id: number, fields: any[]) => ({ id, name: `Form ${id}`, fields }) as any;
const where = { resourceId: 5, action: ResourceFormAction.START, formId: 7 };

describe('ReaderFormImages', () => {
  let handoffs: Record<string, jest.Mock>;
  let service: ReaderFormImages;
  const socket = (state: Record<string, unknown> = {}) =>
    ({ readerId: 42, state: { verifiedUserId: 3, formImages: true, ...state } }) as any;

  beforeEach(() => {
    handoffs = {
      canIssue: jest.fn().mockResolvedValue(true),
      openForReader: jest
        .fn()
        .mockResolvedValue({ handoffId: 'h', token: 't', handoffUrl: 'u', imageCount: 1, maxImages: 2 }),
      imageIds: jest.fn().mockResolvedValue(['a', 'b']),
      endForReader: jest.fn().mockResolvedValue(undefined),
    };
    service = new ReaderFormImages();
    (service as any).handoffs = handoffs;
  });

  describe('adapt', () => {
    const forms = [
      form(1, [field(1, FormFieldType.TEXT)]),
      form(2, [field(2, FormFieldType.IMAGE), field(3, FormFieldType.TEXT)]),
    ];

    it('passes forms through for a capable reader, and forms without image fields for any reader', async () => {
      expect(await service.adapt(socket(), forms)).toEqual({ forms, blocked: false });
      const plain = [forms[0]];
      expect(await service.adapt(socket({ formImages: false }), plain)).toEqual({ forms: plain, blocked: false });
    });

    it('leaves optional image fields out for an old reader and drops forms that have nothing else', async () => {
      const onlyImage = form(4, [field(9, FormFieldType.IMAGE)]);

      const result = await service.adapt(socket({ formImages: false }), [...forms, onlyImage]);

      expect(result.blocked).toBe(false);
      expect(result.forms.map((item) => [item.id, item.fields.map((f) => f.id)])).toEqual([
        [1, [1]],
        [2, [3]],
      ]);
    });

    it('blocks when an old reader would need a required image field, or no link can be built', async () => {
      const required = [form(5, [field(8, FormFieldType.IMAGE, true)])];
      expect((await service.adapt(socket({ formImages: false }), required)).blocked).toBe(true);
      handoffs.canIssue.mockResolvedValue(false);
      expect((await service.adapt(socket(), required)).blocked).toBe(true);
    });
  });

  describe('describeField', () => {
    it('opens the handoff for the signed-in user, remembers its token and passes it back next time', async () => {
      const s = socket();
      const image = field(11, FormFieldType.IMAGE);

      expect(await service.describeField(s, where, image)).toEqual({ handoffUrl: 'u', imageCount: 1, maxImages: 2 });
      await service.describeField(s, where, image);

      expect(handoffs.openForReader.mock.calls[0]).toEqual([
        { readerId: 42, userId: 3, ...where, fieldId: 11 },
        { maxImages: 2 },
        undefined,
      ]);
      expect(handoffs.openForReader.mock.calls[1][2]).toEqual({ handoffId: 'h', token: 't' });
    });

    it('offers nothing without a signed-in user', async () => {
      expect(
        await service.describeField(socket({ verifiedUserId: null }), where, field(11, FormFieldType.IMAGE)),
      ).toBeNull();
      expect(handoffs.openForReader).not.toHaveBeenCalled();
    });
  });

  describe('fillAnswers', () => {
    const image = field(11, FormFieldType.IMAGE, true);
    const f = form(7, [field(1, FormFieldType.TEXT), image]);

    it('replaces what the reader sent for an image field by the ids of its handoff', async () => {
      const s = socket({ formHandoffs: { '5:start:7:11': { handoffId: 'h', token: 't' } } });

      const answers = await service.fillAnswers(
        s,
        where,
        f,
        [
          { fieldId: 1, value: 'x' },
          { fieldId: 11, value: 'whatever' },
        ],
        1,
      );

      expect(answers).toEqual([
        { fieldId: 1, value: 'x' },
        { fieldId: 11, value: JSON.stringify(['a', 'b']) },
      ]);
    });

    it('answers an image field that was sent without any handoff as empty, and ignores one never shown', async () => {
      expect(await service.fillAnswers(socket(), where, f, [{ fieldId: 11, value: '' }], 1)).toEqual([
        { fieldId: 11, value: '' },
      ]);
      expect(await service.fillAnswers(socket(), where, f, [{ fieldId: 1, value: 'x' }], 0)).toEqual([
        { fieldId: 1, value: 'x' },
      ]);
    });

    it('counts a shown image field the reader left out of the page as empty', async () => {
      handoffs.imageIds.mockResolvedValue([]);
      const s = socket({ formHandoffs: { '5:start:7:11': { handoffId: 'h', token: 't' } } });
      expect(await service.fillAnswers(s, where, f, [{ fieldId: 1, value: 'x' }], 1)).toEqual([
        { fieldId: 1, value: 'x' },
        { fieldId: 11, value: '' },
      ]);
    });

    it('leaves an image field of another page alone, even when its handoff exists (the reader prefetched that page)', async () => {
      handoffs.imageIds.mockResolvedValue([]);
      const s = socket({ formHandoffs: { '5:start:7:11': { handoffId: 'h', token: 't' } } });
      expect(await service.fillAnswers(s, where, f, [{ fieldId: 1, value: 'x' }], 0)).toEqual([
        { fieldId: 1, value: 'x' },
      ]);
    });

    it('leaves the answers of forms without image fields alone', async () => {
      const answers = [{ fieldId: 1, value: 'x' }];
      expect(await service.fillAnswers(socket(), where, form(7, [field(1, FormFieldType.TEXT)]), answers, 0)).toBe(
        answers,
      );
    });
  });

  describe('describeField at the same time', () => {
    it('serves overlapping calls for one field one after the other, so only one link is created', async () => {
      const s = socket();
      const image = field(11, FormFieldType.IMAGE);
      let running = 0;
      let overlap = false;
      handoffs.openForReader.mockImplementation(async () => {
        running += 1;
        overlap ||= running > 1;
        await new Promise((resolve) => setImmediate(resolve));
        running -= 1;
        return { handoffId: 'h', token: 't', handoffUrl: 'u', imageCount: 0, maxImages: 2 };
      });

      await Promise.all([
        service.describeField(s, where, image),
        service.describeField(s, where, image),
        service.describeField(s, where, image),
      ]);

      expect(overlap).toBe(false);
      expect(handoffs.openForReader.mock.calls.slice(1).every((call) => call[2]?.handoffId === 'h')).toBe(true);
    });
  });

  describe('refreshDraft', () => {
    it('brings drafted image answers up to date and drops them when no image is left', async () => {
      const s = socket({ formHandoffs: { '5:start:7:11': { handoffId: 'h', token: 't' } } });
      const draft: Record<number, string> = { 11: '["old"]', 1: 'x' };
      const forms = [form(7, [field(1, FormFieldType.TEXT), field(11, FormFieldType.IMAGE)])];

      await service.refreshDraft(s, { resourceId: 5, action: ResourceFormAction.START }, forms, draft);
      expect(draft).toEqual({ 1: 'x', 11: JSON.stringify(['a', 'b']) });

      handoffs.imageIds.mockResolvedValue([]);
      await service.refreshDraft(s, { resourceId: 5, action: ResourceFormAction.START }, forms, draft);
      expect(draft).toEqual({ 1: 'x' });
    });
  });

  describe('ending links', () => {
    it('ends the links of one attempt and forgets its tokens, and the links of the whole reader', () => {
      const s = socket({
        formHandoffs: {
          '5:start:7:11': { handoffId: 'h', token: 't' },
          '6:start:7:11': { handoffId: 'g', token: 'u' },
        },
      });

      service.endAttempt(s, 5, ResourceFormAction.START);
      service.endAllForReader(s);

      expect(s.state.formHandoffs).toEqual({ '6:start:7:11': { handoffId: 'g', token: 'u' } });
      expect(handoffs.endForReader.mock.calls).toEqual([[42, { resourceId: 5, action: 'start' }], [42]]);
    });

    it('ends the links of the reader a disconnect names, although the socket no longer holds its id', () => {
      service.endAllForReader({ readerId: null }, 42);
      expect(handoffs.endForReader).toHaveBeenCalledWith(42);
    });

    it('does not throw when ending fails, and does nothing for a socket without a reader', async () => {
      handoffs.endForReader.mockRejectedValue(new Error('db down'));
      expect(() => service.endAttempt(socket(), 5, ResourceFormAction.START)).not.toThrow();
      service.endAllForReader({ readerId: null } as any);
      await new Promise((resolve) => setImmediate(resolve));
    });
  });
});
