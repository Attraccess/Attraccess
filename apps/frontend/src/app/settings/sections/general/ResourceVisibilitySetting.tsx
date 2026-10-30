import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  ResourceActivityVisibility,
  useSettingsServiceGetResourceVisibilitySettings,
  UseSettingsServiceGetResourceVisibilitySettingsKeyFn,
  useSettingsServiceUpdateResourceVisibilitySettings,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useToastMessage } from '../../../../components/toastProvider';
import { Select } from '../../../../components/select';
import API_ERROR_TRANSLATIONS_DE from '../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../global-translations/api-errors.en.json';
import { SettingsRow } from '../../components/SettingsRow';
import en from './en.json';
import de from './de.json';

const MODES = [ResourceActivityVisibility.ALL, ResourceActivityVisibility.INTRODUCED];

/**
 * Who sees which machines are in use, and by whom. Saves on selection: it is a single choice with an
 * immediate effect, so a save bar would only add a step.
 */
export function ResourceVisibilitySetting() {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useSettingsServiceGetResourceVisibilitySettings();

  const { mutate, isPending } = useSettingsServiceUpdateResourceVisibilitySettings({
    onSuccess(saved) {
      queryClient.setQueryData(UseSettingsServiceGetResourceVisibilitySettingsKeyFn(), saved);
      toast.success({ title: t('inputs.activityVisibility.saved') });
    },
    onError(error: Error) {
      toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });
    },
  });

  const value = data?.activityVisibility;

  return (
    <SettingsRow
      stacked
      label={t('inputs.activityVisibility.label')}
      hint={
        isError
          ? t('inputs.activityVisibility.loadFailed')
          : value === ResourceActivityVisibility.INTRODUCED
            ? t('inputs.activityVisibility.introducedHint')
            : t('inputs.activityVisibility.description')
      }
    >
      <Select
        aria-label={t('inputs.activityVisibility.label')}
        value={value}
        onChange={(next) => {
          if (MODES.some((mode) => mode === next) && next !== value) {
            mutate({ requestBody: { activityVisibility: next as ResourceActivityVisibility } });
          }
        }}
        items={MODES.map((mode) => ({ key: mode, label: t(`inputs.activityVisibility.${mode}`) }))}
        isDisabled={isLoading || isError || isPending}
        fullWidth
      />
    </SettingsRow>
  );
}
