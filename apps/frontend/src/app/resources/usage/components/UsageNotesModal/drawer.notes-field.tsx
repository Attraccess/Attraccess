import { NotesFieldProps } from './drawer.notes-field-props';

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
