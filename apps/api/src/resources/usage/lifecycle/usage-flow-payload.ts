import { optionalUserDisplayName } from '@attraccess/shared';
import {
  FormFieldType,
  parseFormImageIds,
  type UsageFormSubmissionDraft,
  type UsageSession,
  type UsageSessionUser,
} from '@attraccess/application-models';

/** A user as a flow payload carries it: the stored fields plus the computed display name, which templates cannot compute. */
export function withDisplayName<
  T extends { username?: string | null; firstName?: string | null; lastName?: string | null },
>(user: T): T & { displayName: string } {
  return { ...user, displayName: optionalUserDisplayName(user) ?? '' };
}

/**
 * The usage session as flows see it: answered forms by form id, a sanitized user and no resource documentation. An
 * image answer is the list of image ids, never a URL: flows get no access to the images.
 */
export function usageFlowPayload(resourceUsage: UsageSession, formSubmissions?: UsageFormSubmissionDraft[]) {
  const normalizedFormSubmissions = formSubmissions ?? [];
  const mappedFormSubmissions: {
    [key: string]: { formName: string; answers: { [key: number]: { value: string | string[]; name: string } } };
  } = {};

  normalizedFormSubmissions.forEach((submission) => {
    mappedFormSubmissions[submission.form.id] = {
      formName: submission.form.name,
      answers: Object.fromEntries(
        Object.values(submission.data).map((field) => [
          field.fieldDefinition.id,
          {
            value: field.fieldDefinition.type === FormFieldType.IMAGE ? parseFormImageIds(field.value) : field.value,
            name: field.fieldDefinition.name,
          },
        ]),
      ),
    };
  });

  const usageUser: Partial<UsageSessionUser> | undefined =
    resourceUsage.user ?? (resourceUsage.userId != null ? { id: resourceUsage.userId } : undefined);

  const sanitizedUser:
    (Partial<UsageSessionUser> & Pick<UsageSessionUser, 'id'> & { displayName?: string }) | undefined = usageUser
    ? {
        id: usageUser.id,
        username: usageUser.username,
        firstName: usageUser.firstName ?? null,
        lastName: usageUser.lastName ?? null,
        displayName: optionalUserDisplayName(usageUser) ?? '',
        email: usageUser.email,
        createdAt: usageUser.createdAt,
        updatedAt: usageUser.updatedAt,
        billingFactor: usageUser.billingFactor,
        creditBalance: usageUser.creditBalance,
      }
    : undefined;

  const flowPayload = {
    ...resourceUsage,
    resource: {
      ...resourceUsage.resource,
      documentationMarkdown: undefined,
      documentationUrl: undefined,
      documentationType: undefined,
      metadata: resourceUsage.resource?.metadata ?? null,
    },
    user: sanitizedUser,
    formSubmissions: mappedFormSubmissions,
  };

  return flowPayload;
}
