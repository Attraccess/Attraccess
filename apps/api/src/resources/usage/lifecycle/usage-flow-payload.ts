import { FormSubmission, Resource, ResourceUsage, User } from '@attraccess/database-entities';

/** The usage session as flows see it: answered forms by form id, a sanitized user and no resource documentation. */
export function usageFlowPayload(resourceUsage: ResourceUsage, formSubmissions?: FormSubmission[]) {
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

  const usageUser =
    resourceUsage.user ??
    (resourceUsage.userId != null ? ({ id: resourceUsage.userId } as Pick<User, 'id'> & Partial<User>) : undefined);

  const sanitizedUser: (Partial<User> & Pick<User, 'id'>) | undefined = usageUser
    ? {
        id: usageUser.id,
        username: usageUser.username,
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
    } as Partial<Resource>,
    user: sanitizedUser,
    formSubmissions: mappedFormSubmissions,
  };

  return flowPayload;
}
