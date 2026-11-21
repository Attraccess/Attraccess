import { ResourceSelector, useTranslations } from '@attraccess/plugins-frontend-ui';
import { FormScope, useResourceGroupsGetMany } from '@attraccess/react-query-client';
import { Dispatch, SetStateAction } from 'react';
import { Select } from '../../../components/select';
import { EditableForm } from '../types';
import en from '../en.json';
import de from '../de.json';

interface FormScopeSectionProps {
  form: EditableForm;
  setForm: Dispatch<SetStateAction<EditableForm>>;
}

/** Where the form applies: one resource, every resource of a group, or every resource. */
export function FormScopeSection({ form, setForm }: Readonly<FormScopeSectionProps>) {
  const { t } = useTranslations({ en, de });
  const { data: groups, isLoading: groupsLoading } = useResourceGroupsGetMany(undefined, undefined, {
    enabled: form.scope === FormScope.GROUP,
  });

  return (
    <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
      <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('editor.sections.scope')}</h3>
      <Select
        label={t('scope.label')}
        description={t('scope.description')}
        value={form.scope}
        onChange={(key) => setForm((prev) => ({ ...prev, scope: key as FormScope }))}
        items={[FormScope.RESOURCE, FormScope.GROUP, FormScope.GLOBAL].map((scope) => ({
          key: scope,
          label: t(`scope.${scope}`),
        }))}
        data-cy="form-editor-scope-select"
      />
      {form.scope === FormScope.GROUP && (
        <Select
          label={t('scope.groupPicker')}
          placeholder={t('scope.groupPlaceholder')}
          value={form.groupId === null ? undefined : String(form.groupId)}
          onChange={(key) => setForm((prev) => ({ ...prev, groupId: Number(key) }))}
          isLoading={groupsLoading}
          items={(groups ?? []).map((group) => ({ key: String(group.id), label: group.name, textValue: group.name }))}
          data-cy="form-editor-group-select"
        />
      )}
      {form.scope === FormScope.RESOURCE && (
        <div className="flex flex-col gap-1" data-cy="form-editor-resource-select">
          <ResourceSelector
            multiple={false}
            selection={form.resourceId === null ? [] : [form.resourceId]}
            onSelectionChange={(selection) => setForm((prev) => ({ ...prev, resourceId: selection[0] ?? null }))}
          />
        </div>
      )}
      {form.scope !== FormScope.GLOBAL &&
        (form.scope === FormScope.RESOURCE ? form.resourceId === null : form.groupId === null) && (
          <p className="text-sm text-warning">{t('scope.missingOwner')}</p>
        )}
    </section>
  );
}
