import { Description, Input, Label, Radio, RadioGroup, Spinner, TextField } from '@heroui/react';
import { NETWORK_RESTRICTION_MAX_RANGES } from '@attraccess/application-models';
import { LabeledSwitch, StatusAlert, StringListField, useTranslations } from '@attraccess/plugins-frontend-ui';
import { NetworkIpSource, NetworkRestrictionSettingsDto } from '@attraccess/react-query-client';
import { SettingsRow } from '../../../components/SettingsRow';
import { SubHeading } from '../components/SubHeading';
import { NetworkRestrictionDrafts } from '../useNetworkRestrictionDrafts';
import { isSameRange, isValidRange, splitRangeInput } from './networkRange';
import { RangeSuggestions } from './RangeSuggestions';
import { buildRangeSuggestions } from './buildRangeSuggestions';
import { NetworkRestrictionRoleTable } from './NetworkRestrictionRoleTable';
import en from './en.json';
import de from './de.json';

interface NetworkRestrictionCardProps {
  drafts: NetworkRestrictionDrafts;
}

/** The alert about the admin's own address, judged with the saved settings. Neutral until the restriction is on. */
function detectedAlert(settings: NetworkRestrictionSettingsDto) {
  const isActive = settings.enabled && settings.allowedRanges.length > 0;
  if (settings.detectedAddress === null) {
    return { status: isActive ? 'warning' : 'default', key: 'detected.unknown' } as const;
  }
  if (settings.allowedRanges.length === 0) return { status: 'default', key: 'detected.noRanges' } as const;
  if (settings.detectedInside) return { status: isActive ? 'success' : 'default', key: 'detected.inside' } as const;
  return { status: isActive ? 'warning' : 'default', key: 'detected.outside' } as const;
}

/**
 * Settings → Security → Network restriction. Roles that may do an action from outside the allowed network are set
 * here too, and stay editable while the restriction is off, so the table can be prepared before switching it on.
 * Saving and discarding go through the section's single save bar.
 */
export function NetworkRestrictionCard({ drafts }: Readonly<NetworkRestrictionCardProps>) {
  const { t } = useTranslations({ en, de });
  const { settings, matrix, shown, error } = drafts;

  if (drafts.isSettingsLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner size="sm" />
        {t('loading')}
      </div>
    );
  }
  if (!settings) return <StatusAlert status="danger">{t('loadFailed')}</StatusAlert>;

  const detected = detectedAlert(settings);
  const settingsError = error?.group === 'settings' ? error.message : null;
  const rangesError = drafts.isRangesMissing ? t('ranges.required') : null;

  let roleTable = <Spinner size="sm" />;
  if (matrix) {
    roleTable = (
      <NetworkRestrictionRoleTable
        roles={matrix.roles}
        actions={matrix.actions}
        value={drafts.roleDraft}
        onToggle={drafts.toggleRoleAction}
      />
    );
  } else if (drafts.isMatrixError) {
    roleTable = <StatusAlert status="danger">{t('roles.loadFailed')}</StatusAlert>;
  }

  return (
    <section className="flex flex-col gap-4" data-testid="network-restriction-card">
      <SubHeading title={t('heading')} description={t('description')} />

      <StatusAlert status={detected.status}>{t(detected.key, { address: settings.detectedAddress ?? '' })}</StatusAlert>

      <div className="flex flex-col">
        <SettingsRow label={t('enabled.label')} hint={t('enabled.hint')}>
          <LabeledSwitch aria-label={t('enabled.label')} isSelected={shown.enabled} onChange={drafts.toggleEnabled} />
        </SettingsRow>

        <SettingsRow stacked label={t('ranges.label')} hint={t('ranges.hint')}>
          <div className="flex w-full flex-col gap-3">
            <StringListField
              isLabelHidden
              label={t('ranges.label')}
              placeholder={t('ranges.placeholder')}
              emptyHint={t('ranges.empty')}
              values={shown.ranges}
              onChange={drafts.setRanges}
              parseEntries={splitRangeInput}
              validateEntry={(entry) => (isValidRange(entry) ? null : t('ranges.invalid', { entry }))}
              isSameEntry={isSameRange}
              maxEntries={NETWORK_RESTRICTION_MAX_RANGES}
              errorMessage={rangesError}
              data-cy="network-range-input"
            />
            {/* A full list takes no more; the field above says so. */}
            {shown.ranges.length < NETWORK_RESTRICTION_MAX_RANGES && (
              <RangeSuggestions groups={buildRangeSuggestions(settings, shown.ranges)} onAdd={drafts.addRanges} />
            )}
          </div>
        </SettingsRow>

        <SettingsRow stacked label={t('source.label')} hint={t('source.hint')}>
          <div className="flex w-full flex-col gap-2">
            <RadioGroup
              value={shown.ipSource}
              onChange={(next) => drafts.setIpSource(next as NetworkIpSource)}
              aria-label={t('source.label')}
            >
              <Radio value={NetworkIpSource.CLIENT}>
                <Radio.Content>
                  <Radio.Control>
                    <Radio.Indicator />
                  </Radio.Control>
                  <Label>{t('source.client.label')}</Label>
                </Radio.Content>
                <Description>{t('source.client.description')}</Description>
              </Radio>
              <Radio value={NetworkIpSource.HEADER}>
                <Radio.Content>
                  <Radio.Control>
                    <Radio.Indicator />
                  </Radio.Control>
                  <Label>{t('source.header.label')}</Label>
                </Radio.Content>
                <Description>{t('source.header.description')}</Description>
              </Radio>
            </RadioGroup>
            {shown.ipSource === NetworkIpSource.HEADER && (
              <div className="flex flex-col gap-2">
                <TextField
                  fullWidth
                  value={shown.headerName}
                  onChange={drafts.setHeaderName}
                  aria-label={t('source.headerName')}
                >
                  <Label>{t('source.headerName')}</Label>
                  <Input fullWidth data-testid="network-header-name" />
                </TextField>
                <StatusAlert status="warning">{t('source.headerWarning')}</StatusAlert>
              </div>
            )}
          </div>
        </SettingsRow>

        {/* A rejected range or header name, below both rows it can come from; the server names the offending value. */}
        {settingsError !== null && (
          <StatusAlert status="danger" data-cy="network-restriction-error">
            {settingsError}
          </StatusAlert>
        )}

        <SettingsRow stacked label={t('roles.label')} hint={t('roles.hint')}>
          <div className="flex w-full min-w-0 flex-col gap-2">
            {roleTable}
            {error?.group === 'roles' && (
              <StatusAlert status="danger" data-cy="network-restriction-roles-error">
                {error.message}
              </StatusAlert>
            )}
          </div>
        </SettingsRow>
      </div>
    </section>
  );
}
