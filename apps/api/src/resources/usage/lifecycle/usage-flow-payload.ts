import { formatUserDisplayName } from '@attraccess/shared';
import type { UsageFormSubmissionDraft, UsageSession, UsageSessionUser } from '@attraccess/application-models';

/** The usage session as flows see it: answered forms by form id, a sanitized user and no resource documentation. */
export function usageFlowPayload(resourceUsage: UsageSession, formSubmissions?: UsageFormSubmissionDraft[]) {
  const normalizedFormSubmissions = formSubmissions ?? [];
  const mappedFormSubmissions: {
    [key: string]: { formName: string; answers: { [key: number]: { value: string; name: string } } };
  } = {};

  normalizedFormSubmissions.forEach((submission) => {
    mappedFormSubmissions[submission.form.id] = {
      formName: submission.form.name,
      answers: Object.fromEntries(
        Object.values(submission.data).map((field) => [
          field.fieldDefinition.id,
          { value: field.value, name: field.fieldDefinition.name },
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
        displayName: formatUserDisplayName({ ...usageUser, username: usageUser.username ?? '' }),
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
