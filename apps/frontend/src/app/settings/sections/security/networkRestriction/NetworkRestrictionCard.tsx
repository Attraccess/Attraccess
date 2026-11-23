import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Description, Input, Label, Radio, RadioGroup, Spinner, TextArea, TextField } from '@heroui/react';
import { LabeledSwitch, StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  NetworkIpSource,
  NetworkRestrictedAction,
  UseGetNetworkRestrictionRoleActionsKeyFn,
  UseGetNetworkRestrictionSettingsKeyFn,
  useGetNetworkRestrictionRoleActions,
  useGetNetworkRestrictionSettings,
  useGetNetworkRestrictionStatusKey,
  useUpdateNetworkRestrictionRoleActions,
  useUpdateNetworkRestrictionSettings,
} from '@attraccess/react-query-client';
import { NETWORK_RESTRICTION_DEFAULT_RANGES } from '@attraccess/application-models';
import { SettingsRow } from '../../../components/SettingsRow';
import { SettingsSaveBar } from '../../../components/SettingsSaveBar';
import { useToastMessage } from '../../../../../components/toastProvider';
import { getApiErrorMessage } from '../../../../../utils/apiError';
import { SubHeading } from '../components/SubHeading';
import { NetworkRestrictionRoleTable } from './NetworkRestrictionRoleTable';
import en from './en.json';
import de from './de.json';

const splitRanges = (text: string) => text.split(/[\s,;]+/).filter(Boolean);

/**
 * Settings → Security → Network restriction. Roles that may do an action from outside the allowed network are set
 * here too, and stay editable while the restriction is off, so the table can be prepared before switching it on.
 */
export function NetworkRestrictionCard() {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { data: settings, isLoading: settingsLoading } = useGetNetworkRestrictionSettings();
  const { data: matrix } = useGetNetworkRestrictionRoleActions();
  const updateSettings = useUpdateNetworkRestrictionSettings();
  const updateRoleActions = useUpdateNetworkRestrictionRoleActions();

  const [enabled, setEnabled] = useState<boolean | undefined>();
  const [rangesText, setRangesText] = useState<string | undefined>();
  const [ipSource, setIpSource] = useState<NetworkIpSource | undefined>();
  const [headerName, setHeaderName] = useState<string | undefined>();
  const [roleDraft, setRoleDraft] = useState<Record<number, NetworkRestrictedAction[]>>({});
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(
    () => ({
      enabled: enabled ?? settings?.enabled ?? false,
      rangesText: rangesText ?? (settings?.allowedRanges ?? []).join('\n'),
      ipSource: ipSource ?? settings?.ipSource ?? NetworkIpSource.CLIENT,
      headerName: headerName ?? settings?.headerName ?? 'X-Real-Ip',
    }),
    [enabled, rangesText, ipSource, headerName, settings],
  );

  const settingsDirty =
    settings !== undefined &&
    (shown.enabled !== settings.enabled ||
      splitRanges(shown.rangesText).join(',') !== settings.allowedRanges.join(',') ||
      shown.ipSource !== settings.ipSource ||
      shown.headerName !== settings.headerName);
  const rolesDirty = Object.keys(roleDraft).length > 0;

  const discard = () => {
    setEnabled(undefined);
    setRangesText(undefined);
    setIpSource(undefined);
    setHeaderName(undefined);
    setRoleDraft({});
    setError(null);
  };

  const toggleRoleAction = (roleId: number, action: NetworkRestrictedAction, allowed: boolean) => {
    const saved = matrix?.roles.find((role) => role.roleId === roleId)?.actions ?? [];
    const current = roleDraft[roleId] ?? saved;
    const next = allowed ? [...new Set([...current, action])] : current.filter((entry) => entry !== action);
    const unchanged = next.length === saved.length && next.every((entry) => saved.includes(entry));
    setRoleDraft((draft) => {
      const { [roleId]: _removed, ...rest } = draft;
      return unchanged ? rest : { ...rest, [roleId]: next };
    });
  };

  const toggleEnabled = (next: boolean) => {
    setEnabled(next);
    // Suggest the private ranges when switching on with an empty list; the admin can edit them before saving.
    if (next && splitRanges(shown.rangesText).length === 0)
      setRangesText(NETWORK_RESTRICTION_DEFAULT_RANGES.join('\n'));
  };

  const save = async () => {
    setError(null);
    try {
      if (settingsDirty) {
        await updateSettings.mutateAsync({
          body: {
            enabled: shown.enabled,
            allowedRanges: splitRanges(shown.rangesText),
            ipSource: shown.ipSource,
            headerName: shown.headerName,
          },
        });
      }
      if (rolesDirty) {
        await updateRoleActions.mutateAsync({
          body: { roles: Object.entries(roleDraft).map(([roleId, actions]) => ({ roleId: Number(roleId), actions })) },
        });
      }
    } catch (failure) {
      // A bad range or an empty list is a 400 that names the offending value.
      setError(getApiErrorMessage(failure as ApiError));
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: UseGetNetworkRestrictionSettingsKeyFn() }),
      queryClient.invalidateQueries({ queryKey: UseGetNetworkRestrictionRoleActionsKeyFn() }),
      queryClient.invalidateQueries({ queryKey: [useGetNetworkRestrictionStatusKey] }),
    ]);
    discard();
    toast.success({ title: t('saved.title'), description: t('saved.description') });
  };

  if (settingsLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner size="sm" />
        {t('loading')}
      </div>
    );
  }
  if (!settings) return <StatusAlert status="danger">{t('loadFailed')}</StatusAlert>;

  return (
    <section className="flex flex-col gap-4" data-testid="network-restriction-card">
      <SubHeading title={t('heading')} description={t('description')} />

      <StatusAlert status={settings.detectedInside ? 'success' : 'warning'}>
        {settings.detectedAddress === null
          ? t('detected.unknown')
          : t(settings.detectedInside ? 'detected.inside' : 'detected.outside', { address: settings.detectedAddress })}
      </StatusAlert>

      <SettingsRow label={t('enabled.label')} hint={t('enabled.hint')}>
        <LabeledSwitch aria-label={t('enabled.label')} isSelected={shown.enabled} onChange={toggleEnabled} />
      </SettingsRow>

      <SettingsRow stacked label={t('ranges.label')} hint={t('ranges.hint')}>
        <TextField value={shown.rangesText} onChange={setRangesText} aria-label={t('ranges.label')}>
          <TextArea rows={5} placeholder={NETWORK_RESTRICTION_DEFAULT_RANGES.join('\n')} data-testid="network-ranges" />
        </TextField>
      </SettingsRow>

      <SettingsRow stacked label={t('source.label')} hint={t('source.hint')}>
        <RadioGroup
          value={shown.ipSource}
          onChange={(next) => setIpSource(next as NetworkIpSource)}
          aria-label={t('source.label')}
        >
          <Radio value={NetworkIpSource.CLIENT}>
            <Radio.Control>
              <Radio.Indicator />
            </Radio.Control>
            <Radio.Content>
              <Label>{t('source.client.label')}</Label>
              <Description>{t('source.client.description')}</Description>
            </Radio.Content>
          </Radio>
          <Radio value={NetworkIpSource.HEADER}>
            <Radio.Control>
              <Radio.Indicator />
            </Radio.Control>
            <Radio.Content>
              <Label>{t('source.header.label')}</Label>
              <Description>{t('source.header.description')}</Description>
            </Radio.Content>
          </Radio>
        </RadioGroup>
        {shown.ipSource === NetworkIpSource.HEADER && (
          <div className="flex flex-col gap-2">
            <TextField value={shown.headerName} onChange={setHeaderName} aria-label={t('source.headerName')}>
              <Label>{t('source.headerName')}</Label>
              <Input data-testid="network-header-name" />
            </TextField>
            <StatusAlert status="warning">{t('source.headerWarning')}</StatusAlert>
          </div>
        )}
      </SettingsRow>

      <SettingsRow stacked label={t('roles.label')} hint={t('roles.hint')}>
        {matrix ? (
          <NetworkRestrictionRoleTable
            roles={matrix.roles}
            actions={matrix.actions}
            value={roleDraft}
            onToggle={toggleRoleAction}
          />
        ) : (
          <Spinner size="sm" />
        )}
      </SettingsRow>

      {error !== null && (
        <StatusAlert status="danger" data-cy="network-restriction-error">
          {error}
        </StatusAlert>
      )}

      <SettingsSaveBar
        isDirty={settingsDirty || rolesDirty}
        isSaving={updateSettings.isPending || updateRoleActions.isPending}
        onSave={() => void save()}
        onDiscard={discard}
      />
    </section>
  );
}
