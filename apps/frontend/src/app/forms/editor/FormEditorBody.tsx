import { AlertStatusIcon, Button } from '@attraccess/plugins-frontend-ui';
import { Alert, AlertContent, AlertDescription } from '@heroui/react';
import { Dispatch, SetStateAction } from 'react';
import type { FormAppliedResourceDto } from '@attraccess/react-query-client';
import { FormPreview } from '../components/FormPreview';
import { EditableForm } from '../types';
import { FormFieldsSection } from './FormFieldsSection';
import { FormSettingsSections } from './FormSettingsSections';
import { FormScopeSection } from './FormScopeSection';
import { FormAppliesToSection } from './FormAppliesToSection';
import { hasScopeOwner } from './formPayloads';
import { useFormsTranslations } from '../useFormsTranslations';

interface FormEditorBodyProps {
  form: EditableForm;
  setForm: Dispatch<SetStateAction<EditableForm>>;
  /** Where a saved form applies; absent while creating. */
  appliedResources?: FormAppliedResourceDto[];
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  onSave: () => void;
}

/** The form editor's sections, save bar and live preview. */
export function FormEditorBody({
  form,
  setForm,
  appliedResources,
  hasUnsavedChanges,
  isSaving,
  onSave,
}: Readonly<FormEditorBodyProps>) {
  const { t } = useFormsTranslations();
  const activeResourceCount = (appliedResources ?? []).filter((resource) => !resource.disabled).length;
  const canSave = form.name !== '' && form.fields.length > 0 && hasScopeOwner(form);

  return (
    <div className="grid gap-8 lg:grid-cols-[2fr_1fr]" data-cy="form-editor-page">
      <div className="flex flex-col gap-8">
        {activeResourceCount > 1 && (
          <Alert status="accent" data-cy="form-editor-shared-notice">
            <AlertStatusIcon status="accent" />
            <AlertContent>
              <AlertDescription>{t('editor.sharedNotice', { count: activeResourceCount })}</AlertDescription>
            </AlertContent>
          </Alert>
        )}

        <FormSettingsSections form={form} setForm={setForm} />

        <FormScopeSection form={form} setForm={setForm} />

        <FormFieldsSection
          fields={form.fields}
          onFieldsChange={(update) => setForm((prev) => ({ ...prev, fields: update(prev.fields) }))}
        />

        {appliedResources && <FormAppliesToSection resources={appliedResources} />}

        <div className="flex items-center justify-between pt-6 border-t border-default-200">
          {hasUnsavedChanges ? <span className="text-sm text-warning-500">{t('editor.unsaved')}</span> : <span />}
          <Button
            variant="primary"
            onPress={onSave}
            isPending={isSaving}
            isDisabled={!canSave}
            data-cy="form-editor-save-button"
          >
            {t('editor.save')}
          </Button>
        </div>
      </div>

      <aside className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 lg:pt-0 lg:border-t-0 lg:border-l lg:border-default-200 lg:pl-6">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {t('editor.sections.preview')}
        </h3>
        <FormPreview fields={form.fields} />
      </aside>
    </div>
  );
}
