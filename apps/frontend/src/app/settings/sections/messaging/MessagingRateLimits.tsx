import {
  Alert,
  AlertContent,
  AlertDescription,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
} from '@heroui/react';
import { ReactNode, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertStatusIcon, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  MessagingRateLimitSettingsDto,
  UseGetMessagingRateLimitSettingsKeyFn,
  useUpdateMessagingRateLimitSettings,
} from '@attraccess/react-query-client';
import { SettingsRow } from '../../components/SettingsRow';
import { SettingsSaveBar } from '../../components/SettingsSaveBar';
import { useToastMessage } from '../../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

type LimitKey = keyof MessagingRateLimitSettingsDto;

const LIMIT_KEYS: LimitKey[] = ['sendMaxPerWindow', 'sendWindowSeconds', 'contactMaxPerWindow', 'contactWindowSeconds'];

interface MessagingRateLimitsProps {
  /** The stored limits, loaded by the section; `undefined` once settled means the request failed. */
  limits: MessagingRateLimitSettingsDto | undefined;
  children?: ReactNode;
}

/** The four rate limits and their save bar; `children` render below the limit rows, inside the same column. */
export function MessagingRateLimits({ limits, children }: MessagingRateLimitsProps) {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  // Derived draft: an untouched field falls back to the server's value, so a background refetch
  // cannot overwrite an unsaved edit (ATT-868).
  const [draft, setDraft] = useState<Partial<Record<LimitKey, number>>>({});

  const { mutate: saveLimits, isPending: isSaving } = useUpdateMessagingRateLimitSettings(undefined, {
    onSuccess(data) {
      // Prime from the response and release the pin in the same tick — see MonitoringSection.
      queryClient.setQueryData(UseGetMessagingRateLimitSettingsKeyFn(), data);
      setDraft({});
      toast.success({ title: t('saved.title'), description: t('saved.description') });
    },
    onError() {
      toast.error({ title: t('error.title'), description: t('error.description') });
    },
  });

  // Loading and failure both land here: the query is settled and returned nothing usable. Without
  // this, `valueOf` falls back to NaN for every key, `Object.is(NaN, undefined)` is false, and the
  // section paints an "unsaved changes" bar over four blank fields with no edit behind it — Save
  // disabled because NaN is not an integer, Discard powerless because the draft is already empty.
  const areLimitsReady = limits !== undefined;

  // NaN is React Aria's value for a cleared NumberField, and it keeps the field controlled.
  const valueOf = (key: LimitKey) => draft[key] ?? limits?.[key] ?? NaN;
  // A cleared field is still a departure from the saved value: the bar must stay mounted so Discard
  // is reachable, but Save has to be blocked. Treating NaN as "not dirty" would unmount the bar and
  // strand the operator with an empty field and no way back.
  const isDirty = areLimitsReady && LIMIT_KEYS.some((key) => !Object.is(valueOf(key), limits?.[key]));
  const isSavable = LIMIT_KEYS.every((key) => {
    const value = valueOf(key);
    return Number.isInteger(value) && value >= 1;
  });

  return (
    <>
      <div className="flex flex-col">
        {!areLimitsReady ? (
          // The limits are unknown, not zero. The VAPID controls below are a separate query and
          // stay usable, so this replaces only the four rows it actually covers.
          <Alert status="danger" data-testid="messaging-limits-load-failed">
            <AlertStatusIcon status="danger" />
            <AlertContent>
              <AlertDescription>{t('limits.loadFailed')}</AlertDescription>
            </AlertContent>
          </Alert>
        ) : (
          LIMIT_KEYS.map((key) => (
            <SettingsRow
              key={key}
              data-testid={`messaging-limit-row-${key}`}
              label={t(`fields.${key}.label`)}
              hint={t(`fields.${key}.description`)}
            >
              <NumberField
                aria-label={t(`fields.${key}.label`)}
                value={valueOf(key)}
                minValue={1}
                onChange={(next) => setDraft((current) => ({ ...current, [key]: next }))}
              >
                <NumberFieldGroup>
                  <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
                  <NumberFieldInput />
                  <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
                </NumberFieldGroup>
              </NumberField>
            </SettingsRow>
          ))
        )}
        {children}
      </div>

      <SettingsSaveBar
        isDirty={isDirty}
        isSaving={isSaving}
        isSaveDisabled={!isSavable}
        onSave={() => {
          if (!isSavable) return;
          saveLimits({
            body: {
              sendMaxPerWindow: valueOf('sendMaxPerWindow'),
              sendWindowSeconds: valueOf('sendWindowSeconds'),
              contactMaxPerWindow: valueOf('contactMaxPerWindow'),
              contactWindowSeconds: valueOf('contactWindowSeconds'),
            },
          });
        }}
        onDiscard={() => setDraft({})}
      />
    </>
  );
}
