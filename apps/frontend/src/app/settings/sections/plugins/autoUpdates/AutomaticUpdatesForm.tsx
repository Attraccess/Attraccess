import { Button, ConfirmableButton, LabeledSwitch } from '@attraccess/plugins-frontend-ui';
import {
  type PluginUpdatePolicyDto,
  UsePluginControllerUpdatePolicyKeyFn,
  usePluginControllerSetUpdatePolicy,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Select } from '../../../../../components/select/index';
import { useToastMessage } from '../../../../../components/toastProvider';
import { usePluginsTranslations } from '../usePluginsTranslations';
import { NextUpdateWindow } from './NextUpdateWindow';
import { UpdateScheduleFields } from './UpdateScheduleFields';
import {
  toUpdatePolicyBody,
  toUpdatePolicyForm,
  type UpdatePolicyForm,
  updatePolicyFormErrors,
  withCompleteSchedule,
} from './updatePolicyForm';

const STEPS = ['patch', 'minor', 'follow'] as const;

interface Props {
  policy: PluginUpdatePolicyDto;
}

/** Edits the stored policy. Switching automatic updates on is confirmed, because it lets the host restart on its own. */
export function AutomaticUpdatesForm({ policy }: Props) {
  const { t } = usePluginsTranslations();
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<UpdatePolicyForm | null>(null);
  const { mutateAsync: savePolicy, isPending } = usePluginControllerSetUpdatePolicy();

  const form = draft ?? toUpdatePolicyForm(policy);
  const errors = updatePolicyFormErrors(form);
  const isValid = Object.keys(errors).length === 0;
  const switchesOn = form.automaticUpdates && !policy.automaticUpdates;
  const change = (changes: Partial<UpdatePolicyForm>) => setDraft({ ...form, ...changes });

  const save = async () => {
    try {
      const saved = await savePolicy({ body: toUpdatePolicyBody(form) });
      queryClient.setQueryData(UsePluginControllerUpdatePolicyKeyFn(), saved);
      setDraft(null);
      toast.success({ title: t('autoUpdates.saved') });
    } catch (error) {
      toast.error({ title: t('autoUpdates.saveError') });
      // Keeps the confirmation open for another try.
      throw error;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <LabeledSwitch
        isSelected={form.checksEnabled}
        onChange={(checksEnabled) => change({ checksEnabled })}
        isDisabled={isPending}
        data-cy="plugins-auto-updates-checks-switch"
      >
        <span>{t('autoUpdates.checks')}</span>
      </LabeledSwitch>
      <LabeledSwitch
        isSelected={form.automaticUpdates}
        onChange={(automaticUpdates) =>
          setDraft(
            automaticUpdates
              ? { ...form, automaticUpdates }
              : withCompleteSchedule({ ...form, automaticUpdates }, toUpdatePolicyForm(policy)),
          )
        }
        isDisabled={isPending}
        data-cy="plugins-auto-updates-switch"
      >
        <span>{t('autoUpdates.enabled')}</span>
      </LabeledSwitch>
      {form.automaticUpdates ? (
        <>
          {!form.checksEnabled ? <p className="text-sm text-warning">{t('autoUpdates.needsChecks')}</p> : null}
          <Select
            className="max-w-sm"
            label={t('autoUpdates.step')}
            description={t('autoUpdates.stepHint')}
            value={form.mode}
            onChange={(mode) => change({ mode: mode as UpdatePolicyForm['mode'] })}
            items={STEPS.map((step) => ({ key: step, label: t(`autoUpdates.steps.${step}`) }))}
            isDisabled={isPending}
            data-cy="plugins-auto-updates-step"
          />
          <UpdateScheduleFields form={form} errors={errors} onChange={change} isDisabled={isPending} />
          {isValid && form.checksEnabled ? <NextUpdateWindow schedule={toUpdatePolicyBody(form).schedule} /> : null}
        </>
      ) : (
        <p className="text-sm text-muted">{t('autoUpdates.offHint')}</p>
      )}
      <div className="flex gap-2">
        {switchesOn ? (
          <ConfirmableButton
            label={t('autoUpdates.turnOn')}
            status="warning"
            confirm={{
              title: t('autoUpdates.confirmTitle'),
              message: t('autoUpdates.confirmMessage'),
              cancelLabel: t('autoUpdates.cancel'),
              confirmDataCy: 'plugins-auto-updates-confirm-button',
            }}
            onConfirm={save}
            isDisabled={!isValid}
            isPending={isPending}
            buttonProps={{ variant: 'primary', size: 'sm' }}
            data-cy="plugins-auto-updates-save-button"
          />
        ) : (
          <Button
            variant="primary"
            size="sm"
            onPress={() => void save().catch(() => undefined)}
            isDisabled={!draft || !isValid}
            isPending={isPending}
            data-cy="plugins-auto-updates-save-button"
          >
            {t('autoUpdates.save')}
          </Button>
        )}
        {draft ? (
          <Button variant="ghost" size="sm" onPress={() => setDraft(null)} isDisabled={isPending}>
            {t('autoUpdates.discard')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
