import {
  FormFieldType,
  ResourceFormAction,
  type FormRecord,
  type UsageSessionUser,
} from '@attraccess/application-models';
import { ResourceFormsService } from '../../forms/forms.service';
import { arrangeIntroducedUser, runningSession, type InMemoryUsageScope } from './fixtures/arrangements.test-fixture';

/** A form the resource inherits (a global or group form), required on the given actions. */
const inheritedForm = (id: number, scope: 'global' | 'group', actions: ResourceFormAction[]): FormRecord => ({
  id,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  name: `${scope} form`,
  scope,
  resourceId: null,
  groupId: scope === 'group' ? 3 : null,
  deletedAt: null,
  isRequiredOnResourceUsageStart: actions.includes(ResourceFormAction.START),
  isRequiredOnResourceUsageTakeOver: actions.includes(ResourceFormAction.TAKEOVER),
  isRequiredOnResourceUsageEnd: actions.includes(ResourceFormAction.END),
  fields: [
    {
      id: id * 10,
      formId: id,
      name: 'Checked the nozzle?',
      type: FormFieldType.BOOLEAN,
      isRequired: true,
      description: null,
      position: 0,
      options: null,
    },
  ],
});

// ATT-796: starts and ends ask for every form in effect on the resource, also the ones it inherits from a group or
// from a global form. The real forms service resolves them through its store.
describe('usage sessions with inherited forms', () => {
  let scope: InMemoryUsageScope;
  let user: UsageSessionUser;
  let findRequiredForAction: jest.Mock;
  const globalForm = inheritedForm(7, 'global', [ResourceFormAction.START]);
  const groupForm = inheritedForm(8, 'group', [ResourceFormAction.END]);
  const answer = (form: FormRecord) => ({ formId: form.id, answers: [{ fieldId: form.fields[0].id, value: true }] });

  beforeEach(async () => {
    ({ scope, user } = await arrangeIntroducedUser());
    findRequiredForAction = jest.fn(async (_resourceId: number, action: ResourceFormAction) =>
      [globalForm, groupForm].filter(
        (form) =>
          (action === ResourceFormAction.START && form.isRequiredOnResourceUsageStart) ||
          (action === ResourceFormAction.END && form.isRequiredOnResourceUsageEnd),
      ),
    );
    const forms = new ResourceFormsService({ findRequiredForAction } as never);
    scope.forms.prepareRequiredSubmissions.mockImplementation((options) => forms.prepareRequiredSubmissions(options));
  });

  it('refuses a start without the inherited global form and keeps its answers once given', async () => {
    await expect(scope.service.startSession(1, user, { notes: '' })).rejects.toThrow('MissingFormSubmissionException');
    expect(scope.store.sessions.filter((session) => session.userId === user.id)).toHaveLength(0);

    await scope.service.startSession(1, user, { notes: '', formSubmissions: [answer(globalForm)] });

    expect(findRequiredForAction).toHaveBeenLastCalledWith(1, ResourceFormAction.START, expect.anything());
    expect(
      scope.store.appliedDrafts.flatMap((attempt) => attempt.formSubmissions.map((draft) => draft.formId)),
    ).toEqual([globalForm.id]);
  });

  it('asks for the group form on end and not for the start form', async () => {
    runningSession(scope, { id: 5, userId: user.id });

    await expect(scope.service.endSession(1, user, { notes: '' })).rejects.toThrow('MissingFormSubmissionException');
    await scope.service.endSession(1, user, { notes: '', formSubmissions: [answer(groupForm)] });

    expect(findRequiredForAction).toHaveBeenLastCalledWith(1, ResourceFormAction.END, expect.anything());
    const drafts = scope.store.appliedDrafts.flatMap((attempt) => attempt.formSubmissions);
    expect(drafts.map((draft) => [draft.formId, draft.action])).toEqual([[groupForm.id, ResourceFormAction.END]]);
  });
});
