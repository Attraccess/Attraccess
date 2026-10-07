import { Alert, AlertContent, AlertDescription } from '@heroui/react';
import { TwoFactorPolicy } from '@attraccess/react-query-client';
import { SettingsRow } from '../../components/SettingsRow';
import { Select } from '../../../../components/select';
import { AlertStatusIcon } from '../../../../components/AlertStatusIcon';
import { TWO_FACTOR_OPTIONS } from './index.state';
import { SignupDomainsRow } from './index.signup-domains-row';
import { useSecuritySectionState } from './useSecuritySectionState';
type Props = Pick<
  ReturnType<typeof useSecuritySectionState>,
  | 't'
  | 'twoFactorValue'
  | 'setTwoFactorDraft'
  | 'isDomainsLoading'
  | 'areDomainsReady'
  | 'domains'
  | 'domainToAdd'
  | 'setDomainToAdd'
  | 'addDomain'
  | 'setDomainsDraft'
>;
export function SecuritySectionTwoFactorLabel({
  t,
  twoFactorValue,
  setTwoFactorDraft,
  isDomainsLoading,
  areDomainsReady,
  domains,
  domainToAdd,
  setDomainToAdd,
  addDomain,
  setDomainsDraft,
}: Props) {
  return (
    <div className="flex flex-col">
      <SettingsRow stacked label={t('twoFactor.label')} hint={t('twoFactor.hint')}>
        <div className="flex w-full flex-col gap-2">
          <Select
            aria-label={t('twoFactor.label')}
            value={twoFactorValue}
            onChange={(key) => setTwoFactorDraft(key as TwoFactorPolicy)}
            items={TWO_FACTOR_OPTIONS.map(({ value, key }) => ({
              key: value,
              textValue: t(`twoFactor.options.${key}.label`),
              label: (
                <div className="flex flex-col gap-1">
                  <span>{t(`twoFactor.options.${key}.label`)}</span>
                  <span className="text-xs text-muted">{t(`twoFactor.options.${key}.description`)}</span>
                </div>
              ),
            }))}
          />
          {/* `!== OPTIONAL` alone is true while the query is still undefined, which flashed the
                warning for a frame on instances that have 2FA optional. */}
          {twoFactorValue !== undefined && twoFactorValue !== TwoFactorPolicy.OPTIONAL && (
            <Alert status="warning">
              <AlertStatusIcon status="warning" />
              <AlertContent>
                <AlertDescription>{t('twoFactor.warning')}</AlertDescription>
              </AlertContent>
            </Alert>
          )}
        </div>
      </SettingsRow>

      <SignupDomainsRow
        isDomainsLoading={isDomainsLoading}
        areDomainsReady={areDomainsReady}
        domains={domains}
        domainToAdd={domainToAdd}
        setDomainToAdd={setDomainToAdd}
        addDomain={addDomain}
        setDomainsDraft={setDomainsDraft}
      />
    </div>
  );
}
