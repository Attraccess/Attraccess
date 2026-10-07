import { FormFieldType } from '@attraccess/react-query-client';
import { ResourceUsage } from '@attraccess/react-query-client';
import type { NotesFieldProps } from './drawer.contracts';

export function formatFieldValue(
  entry: { value: string; fieldDefinition: { type: FormFieldType } },
  t: (key: string) => string,
) {
  switch (entry.fieldDefinition.type) {
    case FormFieldType.BOOLEAN:
      return entry.value === 'true' ? t('booleanYes') : t('booleanNo');
    case FormFieldType.NUMBER:
    case FormFieldType.SELECT:
      return entry.value;
    default:
      return entry.value;
  }
}

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

export function NotesField({ label, value, emptyText }: NotesFieldProps) {
  const hasNote = Boolean(value?.trim());

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{label}</p>
      {hasNote ? (
        <div className="rounded-xl border border-divider bg-default-50 px-4 py-3 text-sm leading-6 text-default-700 shadow-sm dark:bg-default-100/10">
          <p className="whitespace-pre-wrap break-words">{value}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-divider bg-default-50/60 px-4 py-3 dark:bg-default-100/5">
          <p className="text-sm italic text-default-400">{emptyText}</p>
        </div>
      )}
    </div>
  );
}

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
