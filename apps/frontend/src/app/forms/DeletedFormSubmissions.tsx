import { AlertStatusIcon, PageHeader, useTranslations } from '@attraccess/plugins-frontend-ui';
import { Alert, AlertContent, AlertDescription } from '@heroui/react';
import { FormSubmissionsPanel } from './editor/FormSubmissionsPanel';
import en from './en.json';
import de from './de.json';

interface DeletedFormSubmissionsProps {
  formId: number;
  resourceId: number | null;
  onResourceIdChange: (resourceId: number | null) => void;
}

/** A deleted form has no editor, but its submissions stay readable at its address. */
export function DeletedFormSubmissions({
  formId,
  resourceId,
  onResourceIdChange,
}: Readonly<DeletedFormSubmissionsProps>) {
  const { t } = useTranslations({ en, de });
  return (
    <div className="flex flex-col gap-6" data-cy="deleted-form-submissions">
      <PageHeader title={t('deleted.title', { id: formId })} backTo="/forms" />
      <Alert status="warning">
        <AlertStatusIcon status="warning" />
        <AlertContent>
          <AlertDescription>{t('deleted.description')}</AlertDescription>
        </AlertContent>
      </Alert>
      <FormSubmissionsPanel
        formId={formId}
        resources={[]}
        resourceId={resourceId}
        onResourceIdChange={onResourceIdChange}
      />
    </div>
  );
}
