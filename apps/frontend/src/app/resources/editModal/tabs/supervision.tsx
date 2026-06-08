import { Label, Radio, RadioGroup, TextField, Input } from '@heroui/react';
import { AutoIntroductionTarget, SupervisionMode, useResourcesServiceResourceGroupsGetMany } from '@attraccess/react-query-client';
import { Select } from '../../../../components/select';
import { EditorTabProps } from './props';

const SUPERVISION_MODES: SupervisionMode[] = [
  SupervisionMode.INTRODUCTION_REQUIRED,
  SupervisionMode.SUPERVISION_ALLOWED,
  SupervisionMode.SUPERVISION_REQUIRED,
];

export function SupervisionTab(props: EditorTabProps) {
  const { t, formData, setField } = props;

  const supervisionMode = formData.supervisionMode ?? SupervisionMode.INTRODUCTION_REQUIRED;
  const supervisionAllowed =
    supervisionMode === SupervisionMode.SUPERVISION_ALLOWED ||
    supervisionMode === SupervisionMode.SUPERVISION_REQUIRED;

  const autoPromotionEnabled =
    formData.supervisedUsagesUntilIntroduction !== null &&
    formData.supervisedUsagesUntilIntroduction !== undefined;

  const target = formData.autoIntroductionTarget ?? AutoIntroductionTarget.RESOURCE;

  const { data: groups, isLoading: groupsLoading } = useResourcesServiceResourceGroupsGetMany(undefined, {
    enabled: supervisionAllowed && autoPromotionEnabled && target === AutoIntroductionTarget.GROUP,
  });

  const onModeChange = (value: string) => {
    const mode = value as SupervisionMode;
    setField('supervisionMode', mode);

    // Auto-promotion is only relevant when supervision is allowed.
    if (mode === SupervisionMode.INTRODUCTION_REQUIRED) {
      setField('supervisedUsagesUntilIntroduction', null);
      setField('autoIntroductionTarget', null);
      setField('autoIntroductionGroupId', null);
    }
  };

  const onThresholdChange = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === '') {
      setField('supervisedUsagesUntilIntroduction', null);
      setField('autoIntroductionTarget', null);
      setField('autoIntroductionGroupId', null);
      return;
    }

    setField('supervisedUsagesUntilIntroduction', Math.max(1, Math.floor(Number(trimmed))));
    // Default the target as soon as auto-promotion is turned on.
    if (formData.autoIntroductionTarget === null || formData.autoIntroductionTarget === undefined) {
      setField('autoIntroductionTarget', AutoIntroductionTarget.RESOURCE);
    }
  };

  const onTargetChange = (value: string) => {
    const newTarget = value as AutoIntroductionTarget;
    setField('autoIntroductionTarget', newTarget);
    if (newTarget !== AutoIntroductionTarget.GROUP) {
      setField('autoIntroductionGroupId', null);
    }
  };

  const thresholdValue =
    formData.supervisedUsagesUntilIntroduction === null || formData.supervisedUsagesUntilIntroduction === undefined
      ? ''
      : String(formData.supervisedUsagesUntilIntroduction);

  return (
    <div className="flex flex-col gap-3">
      <span className="text-tiny text-default-400">{t('inputs.supervision.description')}</span>

      <RadioGroup
        value={supervisionMode}
        onChange={onModeChange}
        data-cy="resource-edit-modal-supervision-mode-radiogroup"
      >
        <Label className="sr-only">{t('inputs.supervision.mode.label')}</Label>
        {SUPERVISION_MODES.map((mode) => (
          <Radio key={mode} value={mode} data-cy={`resource-edit-modal-supervision-mode-${mode}`}>
            <Radio.Control>
              <Radio.Indicator />
            </Radio.Control>
            <Radio.Content>
              <span className="text-small">{t(`inputs.supervision.mode.options.${mode}.label`)}</span>
              <span className="text-tiny text-default-400">{t(`inputs.supervision.mode.options.${mode}.description`)}</span>
            </Radio.Content>
          </Radio>
        ))}
      </RadioGroup>

      {supervisionAllowed && (
        <div className="flex flex-col gap-3 pt-3 border-t border-default-200">
          <h4 className="text-small font-semibold">{t('inputs.supervision.autoPromotion.sectionTitle')}</h4>
          <span className="text-tiny text-default-400">{t('inputs.supervision.autoPromotion.description')}</span>

          <TextField
            value={thresholdValue}
            onChange={onThresholdChange}
            data-cy="resource-edit-modal-supervision-threshold-input"
            className="w-full"
          >
            <Label>{t('inputs.supervision.autoPromotion.threshold.label')}</Label>
            <Input
              type="number"
              min={1}
              className="w-full"
              placeholder={t('inputs.supervision.autoPromotion.disabledPlaceholder')}
            />
            <span className="text-tiny text-default-400">
              {t('inputs.supervision.autoPromotion.threshold.description')}
            </span>
          </TextField>

          {autoPromotionEnabled && (
            <>
              <RadioGroup
                value={target}
                onChange={onTargetChange}
                orientation="horizontal"
                data-cy="resource-edit-modal-auto-introduction-target-radiogroup"
              >
                <Label>{t('inputs.supervision.autoPromotion.target.label')}</Label>
                <Radio
                  value={AutoIntroductionTarget.RESOURCE}
                  data-cy="resource-edit-modal-auto-introduction-target-resource"
                >
                  <Radio.Control>
                    <Radio.Indicator />
                  </Radio.Control>
                  <Radio.Content>{t('inputs.supervision.autoPromotion.target.options.resource')}</Radio.Content>
                </Radio>
                <Radio
                  value={AutoIntroductionTarget.GROUP}
                  data-cy="resource-edit-modal-auto-introduction-target-group"
                >
                  <Radio.Control>
                    <Radio.Indicator />
                  </Radio.Control>
                  <Radio.Content>{t('inputs.supervision.autoPromotion.target.options.group')}</Radio.Content>
                </Radio>
              </RadioGroup>

              {target === AutoIntroductionTarget.GROUP && (
                <Select
                  label={t('inputs.supervision.autoPromotion.group.label')}
                  placeholder={t('inputs.supervision.autoPromotion.group.placeholder')}
                  value={
                    formData.autoIntroductionGroupId === null || formData.autoIntroductionGroupId === undefined
                      ? undefined
                      : String(formData.autoIntroductionGroupId)
                  }
                  onChange={(key) => setField('autoIntroductionGroupId', key ? Number(key) : null)}
                  isLoading={groupsLoading}
                  items={(groups ?? []).map((group) => ({ key: String(group.id), label: group.name }))}
                  className="w-full"
                  data-cy="resource-edit-modal-auto-introduction-group-select"
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
