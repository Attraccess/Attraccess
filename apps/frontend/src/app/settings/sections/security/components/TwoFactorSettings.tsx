import { Alert, AlertContent, AlertDescription, Input, Spinner, TextField } from '@heroui/react';
import { TwoFactorPolicy } from '@attraccess/react-query-client';
import { SettingsRow } from '../../../components/SettingsRow';
import { Select } from '../../../../../components/select/index';
import { AlertStatusIcon } from '../../../../../components/AlertStatusIcon';
import { TWO_FACTOR_OPTIONS, useSecuritySectionState } from './SecuritySettingsForm';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Button } from '../../../../../components/button/index';
import en from '../en.json';
import de from '../de.json';

export function SignupDomainsRow({
  isDomainsLoading,
  areDomainsReady,
  domains,
  domainToAdd,
  setDomainToAdd,
  addDomain,
  setDomainsDraft,
}: {
  isDomainsLoading: boolean;
  areDomainsReady: boolean;
  domains: string[];
  domainToAdd: string;
  setDomainToAdd: (value: string) => void;
  addDomain: () => void;
  setDomainsDraft: (domains: string[]) => void;
}) {
  const { t } = useTranslations({ en, de });
  return (
    <SettingsRow stacked label={t('domains.label')} hint={t('domains.hint')} data-testid="signup-domains-row">
      {isDomainsLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner size="sm" />
          {t('domains.loading')}
        </div>
      ) : !areDomainsReady ? (
        // The list is unknown, not empty. Editing from here would stage a change against a
        // fallback that is not the instance's state, and Save is a full replace.
        <Alert status="danger">
          <AlertStatusIcon status="danger" />
          <AlertContent>
            <AlertDescription>{t('domains.loadFailed')}</AlertDescription>
          </AlertContent>
        </Alert>
      ) : (
        <div className="flex w-full flex-col gap-2">
          {/* Wraps rather than clipping: on a tablet the content column is narrow enough that the
                  button would otherwise be pushed past its right edge. */}
          <div className="flex flex-wrap items-end gap-2">
            <TextField
              className="min-w-[12rem] flex-1"
              value={domainToAdd}
              onChange={setDomainToAdd}
              aria-label={t('domains.addLabel')}
              data-testid="signup-domain-input"
            >
              <Input
                placeholder={t('domains.addPlaceholder')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    // There is no <form> here, but the browser still treats Enter in a lone text
                    // input as a submit attempt — which would reload the page.
                    event.preventDefault();
                    addDomain();
                  }
                }}
              />
            </TextField>
            <Button variant="secondary" size="sm" onPress={addDomain} isDisabled={!domainToAdd.trim()}>
              <PlusIcon size={16} />
              {t('domains.addButton')}
            </Button>
          </div>

          {domains.length === 0 ? (
            <p className="text-xs text-muted">{t('domains.empty')}</p>
          ) : (
            <ul className="flex flex-col">
              {domains.map((domain) => (
                <li
                  key={domain}
                  data-testid={`signup-domain-${domain}`}
                  className="flex items-center justify-between gap-2 border-b border-separator py-1.5 last:border-b-0"
                >
                  <span className="truncate font-mono text-sm text-foreground">{domain}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    isIconOnly
                    aria-label={t('domains.remove', { domain })}
                    onPress={() => setDomainsDraft(domains.filter((entry) => entry !== domain))}
                  >
                    <Trash2Icon size={14} />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </SettingsRow>
  );
}

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

export function TwoFactorSettings({
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
