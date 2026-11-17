import { Input, Label, TextField } from '@heroui/react';
import { LabeledSwitch, useTranslations } from '@attraccess/plugins-frontend-ui';
import { Dispatch, SetStateAction } from 'react';
import { EditableForm } from '../types';
import en from '../en.json';
import de from '../de.json';

interface FormSettingsSectionsProps {
  form: EditableForm;
  setForm: Dispatch<SetStateAction<EditableForm>>;
}

/** The identity (name) and behavior (when the form is required) sections of the form editor. */
export function FormSettingsSections({ form, setForm }: Readonly<FormSettingsSectionsProps>) {
  const { t } = useTranslations({ en, de });
  return (
    <>
      <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {t('editor.sections.identity')}
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField isRequired value={form.name} onChange={(v) => setForm((prev) => ({ ...prev, name: v }))}>
            <Label>{t('editor.nameLabel')}</Label>
            <Input placeholder={t('editor.namePlaceholder')} data-cy="form-editor-name-input" />
          </TextField>
        </div>
      </section>

      <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {t('editor.sections.behavior')}
        </h3>
        <div className="divide-y divide-default-200/60 rounded-lg border border-default-200">
          <div className="px-4 py-3">
            <LabeledSwitch
              isSelected={form.isRequiredOnResourceUsageStart}
              onChange={(value) => setForm((prev) => ({ ...prev, isRequiredOnResourceUsageStart: value }))}
            >
              {t('editor.resourceUsageStart')}
            </LabeledSwitch>
          </div>
          <div className="px-4 py-3">
            <LabeledSwitch
              isSelected={form.isRequiredOnResourceUsageTakeOver}
              onChange={(value) => setForm((prev) => ({ ...prev, isRequiredOnResourceUsageTakeOver: value }))}
            >
              {t('editor.resourceUsageTakeover')}
            </LabeledSwitch>
          </div>
          <div className="px-4 py-3">
            <LabeledSwitch
              isSelected={form.isRequiredOnResourceUsageEnd}
              onChange={(value) => setForm((prev) => ({ ...prev, isRequiredOnResourceUsageEnd: value }))}
            >
              {t('editor.resourceUsageEnd')}
            </LabeledSwitch>
          </div>
        </div>
      </section>
    </>
  );
}
