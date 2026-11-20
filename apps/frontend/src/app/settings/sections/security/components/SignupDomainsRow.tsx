import { Alert, AlertContent, AlertDescription, Input, Spinner, TextField } from '@heroui/react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { AlertStatusIcon, Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import { SettingsRow } from '../../../components/SettingsRow';
import { SecurityDrafts } from '../useSecurityDrafts';
import en from '../en.json';
import de from '../de.json';

interface SignupDomainsRowProps extends Pick<
  SecurityDrafts,
  'domainsDraft' | 'setDomainsDraft' | 'domainToAdd' | 'setDomainToAdd'
> {
  /** The stored whitelist; the section loads it. */
  savedDomains: string[] | undefined;
  isDomainsLoading: boolean;
}

export function SignupDomainsRow({
  savedDomains,
  isDomainsLoading,
  domainsDraft,
  setDomainsDraft,
  domainToAdd,
  setDomainToAdd,
}: SignupDomainsRowProps) {
  const { t } = useTranslations({ en, de });
  // `savedDomains === undefined` means the whitelist has not arrived — loading, or the request
  // failed. It must not read as an empty list: PUT is a full replace, so staging one addition off
  // an empty fallback and saving would delete every domain the instance actually has. The row shows
  // its own state instead of the section blocking on it, because a failed request would otherwise
  // strand the whole of Security behind a spinner that never resolves.
  const areDomainsReady = savedDomains !== undefined;
  const domains = domainsDraft ?? savedDomains ?? [];

  const addDomain = () => {
    // Guarded as well as disabled: Enter reaches this without going through the button.
    if (!areDomainsReady) {
      return;
    }
    const value = domainToAdd.trim().toLowerCase();
    if (!value || domains.includes(value)) {
      setDomainToAdd('');
      return;
    }
    setDomainsDraft([...domains, value]);
    setDomainToAdd('');
  };

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
