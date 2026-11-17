import {
  IntroductionHistoryAction,
  type IntroductionRecord,
  type ResourceActorUser,
} from '@attraccess/application-models';
import { toIntroductionDto, toIntroductionHistoryDto } from './introduction-records.dto';

const at = new Date('2030-01-01T00:00:00Z');
const base: IntroductionRecord = {
  id: 1,
  resourceId: 2,
  resourceGroupId: null,
  receiverUserId: 3,
  tutorUserId: null,
  completedAt: at,
  retrainingNotifiedAt: null,
  retrainingRequiredAuditedAt: null,
  createdAt: at,
};
const user = { id: 3, username: 'alice', email: 'secret@example.test' } as unknown as ResourceActorUser;

describe('introduction response mappers', () => {
  it('maps only the introduction columns when no relation was loaded', () => {
    const dto = toIntroductionDto(base);
    expect(Object.keys(dto).sort()).toEqual(
      [
        'completedAt',
        'createdAt',
        'id',
        'receiverUserId',
        'resourceGroupId',
        'resourceId',
        'retrainingNotifiedAt',
        'retrainingRequiredAuditedAt',
        'tutorUserId',
      ].sort(),
    );
  });

  it('maps loaded people, history and group without leaking user details', () => {
    const history = {
      id: 5,
      introductionId: 1,
      action: IntroductionHistoryAction.GRANT,
      performedByUserId: 3,
      comment: null,
      createdAt: at,
      performedByUser: user,
    };
    const dto = toIntroductionDto({
      ...base,
      receiverUser: user,
      tutorUser: null,
      history: [history],
      resourceGroup: {
        id: 9,
        name: 'Wood',
        description: null,
        retrainingMaxAgeDays: null,
        retrainingMaxInactivityDays: null,
        retrainingBlocksAccess: false,
        isHidden: false,
        createdAt: at,
        updatedAt: at,
      },
    });

    expect(dto.receiverUser).toMatchObject({ id: 3, username: 'alice' });
    expect(dto.tutorUser).toBeNull();
    expect(dto.history?.[0].performedByUser).toMatchObject({ id: 3 });
    expect(dto.resourceGroup?.name).toBe('Wood');
    expect(JSON.stringify(dto)).not.toContain('example.test');
    expect(toIntroductionDto({ ...base, resourceGroup: null }).resourceGroup).toBeNull();
    expect(toIntroductionHistoryDto({ ...history, performedByUser: undefined })).not.toHaveProperty('performedByUser');
  });
});
