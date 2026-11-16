import { Alert, AlertContent, AlertDescription } from '@heroui/react';
import { TwoFactorPolicy, useTwoFactorAuthenticationServiceGetTwoFactorPolicy } from '@attraccess/react-query-client';
import { AlertStatusIcon, useTranslations } from '@attraccess/plugins-frontend-ui';
import { SettingsRow } from '../../../components/SettingsRow';
import { Select } from '../../../../../components/select/index';
import { SecurityDrafts } from '../useSecurityDrafts';
import { SignupDomainsRow } from './SignupDomainsRow';
import en from '../en.json';
import de from '../de.json';

const TWO_FACTOR_OPTIONS = [
  { value: TwoFactorPolicy.OPTIONAL, key: 'optional' },
  { value: TwoFactorPolicy.REQUIRED_FOR_PRIVILEGED, key: 'privileged' },
  { value: TwoFactorPolicy.REQUIRED_FOR_ALL, key: 'all' },
];

type TwoFactorSettingsProps = Pick<
  SecurityDrafts,
  'twoFactorDraft' | 'setTwoFactorDraft' | 'domainsDraft' | 'setDomainsDraft' | 'domainToAdd' | 'setDomainToAdd'
>;

export function TwoFactorSettings({
  twoFactorDraft,
  setTwoFactorDraft,
  domainsDraft,
  setDomainsDraft,
  domainToAdd,
  setDomainToAdd,
}: TwoFactorSettingsProps) {
  const { t } = useTranslations({ en, de });
  const { data: twoFactor } = useTwoFactorAuthenticationServiceGetTwoFactorPolicy();
  const twoFactorValue = twoFactorDraft ?? twoFactor?.policy;
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
        domainsDraft={domainsDraft}
        setDomainsDraft={setDomainsDraft}
        domainToAdd={domainToAdd}
        setDomainToAdd={setDomainToAdd}
      />
    </div>
  );
}
