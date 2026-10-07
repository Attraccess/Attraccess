import { HTMLAttributes } from 'react';
import { Form, Input, Label, Spinner, TextArea, TextField } from '@heroui/react';
import { Button } from '../../../components/button';
import { LabeledSwitch } from '../../../components/labeledSwitch';
import { Save, Edit3, Trash2Icon } from 'lucide-react';
import { DeleteConfirmationModal } from '../../../components/deleteConfirmationModal';
import { useGroupDetailsFormState } from './useGroupDetailsFormState';

export interface GroupDetailsFormProps {
  groupId: number;
}

export function GroupDetailsForm(
  props: Readonly<GroupDetailsFormProps & Omit<HTMLAttributes<HTMLDivElement>, 'children'>>,
) {
  const {
    className,
    rest,
    t,
    name,
    setName,
    description,
    setDescription,
    isHidden,
    setIsHidden,
    group,
    isLoading,
    error,
    isUpdating,
    handleSubmit,
    isDeleting,
    handleDelete,
    showDeleteConfirmation,
    setShowDeleteConfirmation,
  } = useGroupDetailsFormState(props);

  if (isLoading) {
    return (
      <div className={className} {...rest} data-cy="group-details-form-loading">
        <div className="flex items-center justify-center py-8">
          <Spinner />
          <span className="ml-2 opacity-70">{t('states.loading')}</span>
        </div>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className={className} {...rest} data-cy="group-details-form-error">
        <div className="flex items-center gap-3">
          <Edit3 size={20} color="red" />
          <div>
            <p className="text-danger font-medium">{t('errors.load.title')}</p>
            <p className="text-sm opacity-70">{t('errors.load.description')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className} {...rest} data-cy="group-details-form">
      <Form onSubmit={handleSubmit} className="gap-6 w-full" data-cy="group-details-form-form">
        <section className="w-full flex flex-col gap-4">
          <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('sections.details')}</h3>

          <TextField value={name} onChange={setName} isRequired className="w-full">
            <Label>{t('form.fields.name.label')}</Label>
            <Input placeholder={t('form.fields.name.placeholder')} data-cy="group-details-form-name-input" />
          </TextField>

          <TextArea
            placeholder={t('form.fields.description.placeholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            data-cy="group-details-form-description-input"
          />
        </section>

        <section className="w-full flex flex-col gap-2">
          <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('sections.visibility')}</h3>

          <LabeledSwitch isSelected={isHidden} onChange={setIsHidden} data-cy="group-details-form-is-hidden-switch">
            <span className="text-small">{t('form.fields.isHidden.label')}</span>
          </LabeledSwitch>
          <span className="text-tiny text-default-400">{t('form.fields.isHidden.description')}</span>
        </section>

        <div className="flex flex-col gap-2 w-full">
          <Button
            variant="primary"
            type="submit"
            isPending={isUpdating}
            isDisabled={!name.trim() || isUpdating}
            className="w-full"
            data-cy="group-details-form-save-button"
          >
            <Save size={16} />
            {t('form.buttons.save')}
          </Button>

          <Button
            variant="danger"
            className="w-full"
            onPress={() => setShowDeleteConfirmation(true)}
            data-cy="group-details-form-delete-button"
          >
            <Trash2Icon className="w-4 h-4" />
            {t('form.buttons.delete')}
          </Button>
        </div>

        <DeleteConfirmationModal
          isOpen={showDeleteConfirmation}
          onClose={() => setShowDeleteConfirmation(false)}
          onConfirm={() => handleDelete()}
          itemName={group.name}
          isDeleting={isDeleting}
        />
      </Form>
    </div>
  );
}
