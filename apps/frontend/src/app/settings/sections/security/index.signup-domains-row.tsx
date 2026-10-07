import { Alert, AlertContent, AlertDescription, Input, Spinner, TextField } from '@heroui/react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { SettingsRow } from '../../components/SettingsRow';
import { Button } from '../../../../components/button';
import { AlertStatusIcon } from '../../../../components/AlertStatusIcon';
import en from './en.json';
import de from './de.json';

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
