import { FormFieldType, ResourceUsage } from '@attraccess/react-query-client';
import { formatFieldValue } from './drawer.format-field-value';

export function renderFormSubmissions(session: ResourceUsage, t: (key: string) => string) {
  return session.formSubmissions?.map((submission) => {
    const entries = Object.values(
      (submission.data as Record<string, { value: string; fieldDefinition: { name: string; type: FormFieldType } }>) ??
        {},
    );

    if (!entries.length) {
      return null;
    }

    return (
      <div key={submission.id} className="rounded-lg border border-default-200 dark:border-default-100 p-3 space-y-2">
        <p className="text-xs font-medium text-default-500">{submission.form?.name ?? `Form #${submission.formId}`}</p>
        {entries.map((entry, index) => (
          <div key={`${submission.id}-${index}`}>
            <p className="text-sm font-semibold text-default-600">{entry.fieldDefinition.name}</p>
            <p className="text-sm text-default-500">{formatFieldValue(entry, t)}</p>
          </div>
        ))}
      </div>
    );
  });
}
