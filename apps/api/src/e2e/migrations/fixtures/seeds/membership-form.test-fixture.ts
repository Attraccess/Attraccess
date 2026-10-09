import type { DataSource } from 'typeorm';
import {
  Form,
  FormField,
  FormFieldType,
  FormSubmission,
  IntroductionHistoryAction,
  Project,
  ProjectInvitation,
  ProjectInvitationStatus,
  ProjectMember,
  ProjectMemberRole,
  Resource,
  ResourceFormAction,
  ResourceGroup,
  ResourceIntroducer,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  ResourceUsage,
  User,
} from '@attraccess/database-entities';
import { ensureEntity } from '../seed-storage.test-fixture';
export async function migrationMembershipFormSeeds(
  dataSource: DataSource,
  seedTag: string,
  primaryUser: User,
  secondaryUser: User,
  resourceGroup: ResourceGroup,
  resource: Resource,
  project: Project,
  usage: ResourceUsage,
) {
  const introductionRepo = dataSource.getRepository(ResourceIntroduction);

  const introducerRepo = dataSource.getRepository(ResourceIntroducer);

  const introductionHistoryRepo = dataSource.getRepository(ResourceIntroductionHistoryItem);

  const projectMemberRepo = dataSource.getRepository(ProjectMember);

  const projectInvitationRepo = dataSource.getRepository(ProjectInvitation);

  const formRepo = dataSource.getRepository(Form);

  const formFieldRepo = dataSource.getRepository(FormField);

  const formSubmissionRepo = dataSource.getRepository(FormSubmission);

  const introduction = await ensureEntity(introductionRepo, () => ({
    resourceId: resource.id,
    receiverUserId: primaryUser.id,
    tutorUserId: secondaryUser.id,
    resourceGroupId: resourceGroup.id,
  }));

  await ensureEntity(introducerRepo, () => ({
    resourceId: resource.id,
    userId: secondaryUser.id,
    resourceGroupId: resourceGroup.id,
  }));

  await ensureEntity(introductionHistoryRepo, () => ({
    introductionId: introduction.id,
    action: IntroductionHistoryAction.GRANT,
    performedByUserId: secondaryUser.id,
    comment: 'Seed grant',
  }));

  await ensureEntity(projectMemberRepo, () => ({
    projectId: project.id,
    userId: secondaryUser.id,
    role: ProjectMemberRole.VIEWER,
  }));

  await ensureEntity(projectInvitationRepo, () => ({
    projectId: project.id,
    inviterId: primaryUser.id,
    invitedUserId: secondaryUser.id,
    status: ProjectInvitationStatus.PENDING,
    requestedRole: ProjectMemberRole.VIEWER,
  }));

  const form = await ensureEntity(formRepo, () => ({
    name: `Seed Form ${seedTag}`,
    resourceId: resource.id,
    isRequiredOnResourceUsageStart: true,
    isRequiredOnResourceUsageTakeOver: false,
    isRequiredOnResourceUsageEnd: false,
  }));

  const formField = await ensureEntity(formFieldRepo, () => ({
    formId: form.id,
    name: 'Seed Field',
    type: FormFieldType.TEXT,
    isRequired: false,
    description: 'Seed field',
    options: null,
  }));

  await ensureEntity(formSubmissionRepo, () => ({
    formId: form.id,
    userId: primaryUser.id,
    resourceUsageId: usage.id,
    action: ResourceFormAction.START,
    data: {
      field_1: {
        value: 'seed',
        fieldDefinition: {
          id: formField.id,
          name: formField.name,
          type: formField.type,
        },
      },
    } as unknown as FormSubmission['data'],
  }));
}
