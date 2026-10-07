import {
  Form,
  TextField,
  Label,
  Input,
  FieldError,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeading,
} from '@heroui/react';
import { Button } from '../../../components/button';
import { LabeledSwitch } from '../../../components/labeledSwitch';
import { StandardDrawer } from '../../../components/standardDrawer';
import { Props } from './resourceGroupUpsertModal.props';
import { useResourceGroupUpsertModalState } from './useResourceGroupUpsertModalState';

// Define a more specific type for the expected error structure from the API

export function ResourceGroupUpsertModal(props: Readonly<Props>) {
  const {
    isOpen,
    open,
    setOpen,
    closeDisclosure,
    t,
    nameInputRef,
    formData,
    setFormData,
    setApiErrors,
    isEditMode,
    mutation,
    handleSubmit,
    getFieldError,
  } = useResourceGroupUpsertModalState(props);

  return (
    <>
      {props.children(open)}
      <StandardDrawer isOpen={isOpen} onOpenChange={setOpen}>
        <Form onSubmit={handleSubmit} data-cy="resource-group-upsert-modal" className="contents">
          <DrawerHeader>
            <DrawerHeading className="text-lg font-semibold">
              {isEditMode ? t('modalTitleUpdate') : t('modalTitleCreate')}
            </DrawerHeading>
          </DrawerHeader>

          <DrawerBody className="w-full space-y-4">
            <TextField
              isRequired
              isInvalid={!!getFieldError('name')}
              value={formData.name}
              onChange={(v) => {
                setFormData({ ...formData, name: v });
                setApiErrors((prev) => ({ ...prev, name: undefined }));
              }}
              data-cy="resource-group-name-input"
            >
              <Label>{t('nameLabel')}</Label>
              <Input ref={nameInputRef} />
              {getFieldError('name') && <FieldError>{getFieldError('name')}</FieldError>}
            </TextField>
            <TextField
              isInvalid={!!getFieldError('description')}
              value={formData.description}
              onChange={(v) => {
                setFormData({ ...formData, description: v });
                setApiErrors((prev) => ({ ...prev, description: undefined }));
              }}
              data-cy="resource-group-description-input"
            >
              <Label>{t('descriptionLabel')}</Label>
              <Input />
              {getFieldError('description') && <FieldError>{getFieldError('description')}</FieldError>}
            </TextField>

            <div className="flex flex-col gap-3">
              <h3 className="text-small font-semibold">{t('retraining.sectionTitle')}</h3>
              <span className="text-tiny text-default-400">{t('retraining.description')}</span>

              <TextField
                value={formData.retrainingMaxAgeDays == null ? '' : String(formData.retrainingMaxAgeDays)}
                onChange={(v) =>
                  setFormData({
                    ...formData,
                    retrainingMaxAgeDays: v.trim() === '' ? null : Math.max(0, Math.floor(Number(v))),
                  })
                }
                data-cy="resource-group-retraining-max-age-input"
              >
                <Label>{t('retraining.maxAgeDays.label')}</Label>
                <Input type="number" min={0} placeholder={t('retraining.disabledPlaceholder')} />
              </TextField>

              <TextField
                value={formData.retrainingMaxInactivityDays == null ? '' : String(formData.retrainingMaxInactivityDays)}
                onChange={(v) =>
                  setFormData({
                    ...formData,
                    retrainingMaxInactivityDays: v.trim() === '' ? null : Math.max(0, Math.floor(Number(v))),
                  })
                }
                data-cy="resource-group-retraining-max-inactivity-input"
              >
                <Label>{t('retraining.maxInactivityDays.label')}</Label>
                <Input type="number" min={0} placeholder={t('retraining.disabledPlaceholder')} />
              </TextField>

              <LabeledSwitch
                isSelected={formData.retrainingBlocksAccess ?? false}
                onChange={(value) => setFormData({ ...formData, retrainingBlocksAccess: value })}
                data-cy="resource-group-retraining-blocks-access-switch"
              >
                <span className="text-small">{t('retraining.blocksAccess.label')}</span>
              </LabeledSwitch>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-small font-semibold">{t('visibility.sectionTitle')}</h3>
              <span className="text-tiny text-default-400">{t('visibility.description')}</span>

              <LabeledSwitch
                isSelected={formData.isHidden ?? false}
                onChange={(value) => setFormData({ ...formData, isHidden: value })}
                data-cy="resource-group-is-hidden-switch"
              >
                <span className="text-small">{t('visibility.hidden.label')}</span>
              </LabeledSwitch>
            </div>
          </DrawerBody>

          <DrawerFooter>
            <Button variant="secondary" onPress={closeDisclosure} data-cy="resource-group-upsert-modal-cancel-button">
              {t('cancelButton')}
            </Button>
            <Button
              variant="primary"
              type="submit"
              isPending={mutation.isPending}
              data-cy="resource-group-upsert-modal-submit-button"
            >
              {isEditMode ? t('updateButton') : t('createButton')}
            </Button>
          </DrawerFooter>
        </Form>
      </StandardDrawer>
    </>
  );
}
