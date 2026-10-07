import { Accordion, Input, Label, Spinner, TextField } from '@heroui/react';
import { Button } from '../../../../components/button';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { PageHeader } from '../../../../components/pageHeader';
import { DeleteConfirmationModal } from '../../../../components/deleteConfirmationModal';
import { FormPreview } from './components/FormPreview';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableField } from './FormEditorPage.helpers';
import { useFormEditorPageState } from './useFormEditorPageState';

export function FormEditorPage() {
  const {
    resourceId,
    isCreateMode,
    t,
    resource,
    formResponse,
    isLoadingForm,
    form,
    setForm,
    deleteModalOpen,
    setDeleteModalOpen,
    expandedFieldKeys,
    setExpandedFieldKeys,
    createForm,
    updateForm,
    deleteForm,
    lastLabelInputRef,
    addField,
    updateField,
    removeField,
    sensors,
    handleDragEnd,
    fieldSortableIds,
    hasUnsavedChanges,
    handleSave,
    handleDelete,
  } = useFormEditorPageState();

  if (!isCreateMode && isLoadingForm) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={isCreateMode ? t('editor.createTitle') : t('editor.editTitle', { formName: formResponse?.name ?? '' })}
        subtitle={resource?.name}
        backTo={`/resources/${resourceId}/forms`}
        actions={[
          {
            key: 'delete',
            label: t('editor.delete'),
            variant: 'destructive',
            isHidden: isCreateMode,
            onPress: () => setDeleteModalOpen(true),
          },
        ]}
      />

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]" data-cy="form-editor-page">
        <div className="flex flex-col gap-8">
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

          <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
                {t('editor.sections.fields')}
              </h3>
              <Button variant="secondary" onPress={addField} data-cy="form-editor-add-field-button">
                {t('editor.addField')}
              </Button>
            </div>

            {form.fields.length === 0 ? (
              <div className="rounded-lg border border-dashed border-default-200 p-6 text-center">
                <p className="font-medium text-default-600">{t('editor.emptyFieldsTitle')}</p>
                <p className="text-sm text-default-400">{t('editor.emptyFieldsDescription')}</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={fieldSortableIds} strategy={verticalListSortingStrategy}>
                  <Accordion variant="surface" expandedKeys={expandedFieldKeys} onExpandedChange={setExpandedFieldKeys}>
                    {form.fields.map((field, index) => (
                      <SortableField
                        key={field._id ?? `field-${field.id}`}
                        field={field}
                        index={index}
                        onChange={(value) => updateField(index, value)}
                        onRemove={() => removeField(index)}
                        t={t}
                        labelInputRef={index === form.fields.length - 1 ? lastLabelInputRef : undefined}
                      />
                    ))}
                  </Accordion>
                </SortableContext>
              </DndContext>
            )}
          </section>

          <div className="flex items-center justify-between pt-6 border-t border-default-200">
            {hasUnsavedChanges ? <span className="text-sm text-warning-500">{t('editor.unsaved')}</span> : <span />}
            <Button
              variant="primary"
              onPress={handleSave}
              isPending={createForm.isPending || updateForm.isPending}
              isDisabled={!form.name || form.fields.length === 0}
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
          <FormPreview fields={form.fields} t={t} />
        </aside>
      </div>

      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        itemName={formResponse?.name ?? ''}
        isDeleting={deleteForm.isPending}
      />
    </div>
  );
}
