import { FormFieldType, ResourceUsage } from '@attraccess/react-query-client';

export function hasRenderableFormSubmissions(session: ResourceUsage): boolean {
  if (!session.formSubmissions || session.formSubmissions.length === 0) return false;
  return session.formSubmissions.some((submission) => {
    const entries = Object.values(
      (submission.data as Record<string, { value: string; fieldDefinition: { name: string; type: FormFieldType } }>) ??
        {},
    );
    return entries.length > 0;
  });
}
