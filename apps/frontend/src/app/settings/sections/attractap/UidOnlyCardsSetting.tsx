// The dangerous switch that lets cards without AES (UID only) be enrolled and used
// FEATURE: UID-only RFID cards
import { useQueryClient } from '@tanstack/react-query';
import { Description } from '@heroui/react';
import { ConfirmableButton, LabeledSwitch, StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  useGetCardWriterSettings,
  UseGetCardWriterSettingsKeyFn,
  useUpdateUidOnlyCardsSetting,
} from '@attraccess/react-query-client';
import { SettingsRow } from '../../components/SettingsRow';
import { useToastMessage } from '../../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../global-translations/api-errors.en.json';
import en from './en.json';
import de from './de.json';

/**
 * Allow UID-only cards (insecure). It saves on its own, through its own endpoint, so it never touches the reader
 * settings: turning it on needs a confirmation, turning it off does not. Off by default.
 */
export function UidOnlyCardsSetting() {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { data: settings } = useGetCardWriterSettings();
  const { mutateAsync: save, isPending } = useUpdateUidOnlyCardsSetting(undefined, {
    onSuccess: (data) => {
      queryClient.setQueryData(UseGetCardWriterSettingsKeyFn(), data);
      toast.success({ title: t(data.allowUidOnlyCards ? 'uidOnly.saved.enabled' : 'uidOnly.saved.disabled') });
    },
    onError: (error: Error) => toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' }),
  });

  if (!settings) return null;
  const enabled = settings.allowUidOnlyCards === true;
  const update = (allowUidOnlyCards: boolean) => save({ body: { allowUidOnlyCards } });

  return (
    <SettingsRow
      label={t('uidOnly.label')}
      hint={t('uidOnly.description')}
      stacked
      data-testid="uid-only-cards-setting"
    >
      {/* SettingsRow lays its children out in one row: stack the warning above the switch. */}
      <div className="flex w-full flex-col gap-3">
        <StatusAlert status="danger" title={t('uidOnly.warningTitle')}>
          {t('uidOnly.warning')}
        </StatusAlert>
        {/* One switch for both states, so keyboard focus stays on it when the value changes. */}
        <ConfirmableButton
          label={t('uidOnly.switch')}
          status="warning"
          isPending={isPending}
          onConfirm={() => update(true)}
          confirm={{
            title: t('uidOnly.confirm.title'),
            message: t('uidOnly.confirm.message'),
            confirmLabel: t('uidOnly.confirm.confirm'),
            cancelLabel: t('uidOnly.confirm.cancel'),
            'data-cy': 'uid-only-cards-confirm-dialog',
            confirmDataCy: 'uid-only-cards-confirm',
          }}
          renderActivator={(open, props) => (
            <LabeledSwitch
              isSelected={enabled}
              isDisabled={props.isDisabled || props.isPending}
              // Turning it on asks first; turning it off saves right away. onError already shows a failure, so the
              // rejected promise must not escape as an unhandled rejection.
              onChange={(next) => (next ? open() : update(false).catch(() => undefined))}
              data-testid="uid-only-cards-switch"
            >
              {props.label}
            </LabeledSwitch>
          )}
        />
        {!enabled && <Description>{t('uidOnly.offNote')}</Description>}
      </div>
    </SettingsRow>
  );
}
