// The dangerous switch that lets cards without AES (UID only) be enrolled and used
// FEATURE: UID-only RFID cards
import { useQueryClient } from '@tanstack/react-query';
import { Alert, AlertContent, AlertDescription, AlertTitle, Description } from '@heroui/react';
import { ConfirmableButton, LabeledSwitch, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  useGetCardWriterSettings,
  UseGetCardWriterSettingsKeyFn,
  useUpdateCardWriterSettings,
} from '@attraccess/react-query-client';
import { SettingsRow } from '../../components/SettingsRow';
import { useToastMessage } from '../../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../global-translations/api-errors.en.json';
import en from './en.json';
import de from './de.json';

/**
 * Allow UID-only cards (insecure). It saves on its own, not with the reader settings below it: turning it on
 * needs a confirmation, turning it off does not. Off by default.
 */
export function UidOnlyCardsSetting() {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { data: settings } = useGetCardWriterSettings();
  const { mutateAsync: save, isPending } = useUpdateCardWriterSettings(undefined, {
    onSuccess: (data) => queryClient.setQueryData(UseGetCardWriterSettingsKeyFn(), data),
    onError: (error: Error) => toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' }),
  });

  if (!settings) return null;
  const enabled = settings.allowUidOnlyCards === true;
  // The reader settings stay as they were saved: this switch changes nothing else.
  const update = (allowUidOnlyCards: boolean) =>
    save({ body: { mode: settings.mode, readerIds: settings.readerIds, allowUidOnlyCards } });

  return (
    <SettingsRow
      label={t('uidOnly.label')}
      hint={t('uidOnly.description')}
      stacked
      data-testid="uid-only-cards-setting"
    >
      <Alert status="danger">
        <AlertContent>
          <AlertTitle>{t('uidOnly.warningTitle')}</AlertTitle>
          <AlertDescription>{t('uidOnly.warning')}</AlertDescription>
        </AlertContent>
      </Alert>
      {enabled ? (
        <LabeledSwitch
          isSelected
          isDisabled={isPending}
          onChange={() => void update(false)}
          data-testid="uid-only-cards-switch"
        >
          {t('uidOnly.switch')}
        </LabeledSwitch>
      ) : (
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
              isSelected={false}
              isDisabled={props.isDisabled || props.isPending}
              onChange={open}
              data-testid="uid-only-cards-switch"
            >
              {props.label}
            </LabeledSwitch>
          )}
        />
      )}
      {!enabled && <Description>{t('uidOnly.offNote')}</Description>}
    </SettingsRow>
  );
}
