import {
  FormFieldType,
  ResourceFormAction,
  type UsageFormSubmissionDraft,
  type UsageSession,
} from '@attraccess/application-models';
import { usageFlowPayload, withDisplayName } from './usage-flow-payload';

const session = (user: Record<string, unknown>): UsageSession =>
  ({ id: 1, userId: 5, resource: { id: 2, name: 'Laser' }, user }) as unknown as UsageSession;

describe('usageFlowPayload', () => {
  it('gives flows first name, last name and display name next to the username', () => {
    const { user } = usageFlowPayload(session({ id: 5, username: 'ada', firstName: 'Ada', lastName: 'Lovelace' }));
    expect(user).toMatchObject({
      username: 'ada',
      firstName: 'Ada',
      lastName: 'Lovelace',
      displayName: 'Ada Lovelace',
    });
  });

  it('falls back to the username without names', () => {
    const { user } = usageFlowPayload(session({ id: 5, username: 'ada' }));
    expect(user).toMatchObject({ firstName: null, lastName: null, displayName: 'ada' });
  });

  it('gives an image answer as the list of image ids and leaves a text answer as written', () => {
    const answer = (id: number, type: FormFieldType, value: string) => ({
      value,
      fieldDefinition: { id, formId: 3, name: `F${id}`, type, isRequired: false, description: null, position: id },
    });
    const submission = {
      formId: 3,
      form: { id: 3, name: 'Check-in' },
      resourceUsageId: 1,
      userId: 5,
      action: ResourceFormAction.START,
      data: {
        1: answer(1, FormFieldType.IMAGE, '["a","b"]'),
        2: answer(2, FormFieldType.TEXT, '["a","b"]'),
      },
    } as unknown as UsageFormSubmissionDraft;

    const { formSubmissions } = usageFlowPayload(session({ id: 5, username: 'ada' }), [submission]);

    expect(formSubmissions).toEqual({
      3: {
        formName: 'Check-in',
        answers: { 1: { value: ['a', 'b'], name: 'F1' }, 2: { value: '["a","b"]', name: 'F2' } },
      },
    });
  });
});

describe('withDisplayName', () => {
  it('adds the computed display name to a takeover user and keeps the other fields', () => {
    expect(withDisplayName({ id: 5, username: 'ada', firstName: 'Ada', lastName: null })).toEqual({
      id: 5,
      username: 'ada',
      firstName: 'Ada',
      lastName: null,
      displayName: 'Ada',
    });
    expect(withDisplayName({ id: 6, username: 'plain' }).displayName).toBe('plain');
  });
});
