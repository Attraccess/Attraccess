import { Link, Tooltip, TooltipContent } from '@heroui/react';
import { Copy } from 'lucide-react';
import { Button } from '../../../../components/button';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { SSOProviderSetupUrls } from '../useSSOProviderSetupUrls';
import en from '../en.json';
import de from '../de.json';

interface SetupInstructionsSectionProps {
  isSamlProvider: boolean;
  setupUrls: SSOProviderSetupUrls;
  onCopy: (value: string) => void;
}

export const SetupInstructionsSection = ({ isSamlProvider, setupUrls, onCopy }: SetupInstructionsSectionProps) => {
  const { t } = useTranslations({ en, de });
  const {
    hasSetupUrls,
    authentikRedirectRegexPattern,
    samlCallbackUrl,
    oidcCallbackUrl,
    docsSsoProvidersUrl,
    docsAuthentikPermissionsUrl,
  } = setupUrls;

  return (
    <section
      className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0"
      data-cy="sso-provider-form-setup-section"
    >
      <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('setupInstructions')}</h3>
      <p className="text-xs text-default-500">{t('setupInstructionsHint')}</p>
      <dl className="flex flex-col gap-4">
        {!isSamlProvider && (
          <div className="flex flex-col gap-1">
            <dt className="text-sm font-medium">{t('authentikRedirectRegex')}</dt>
            <dd className="flex items-center gap-2 rounded-md border border-default-200 bg-default-50 px-3 py-2">
              <code
                className="flex-1 text-xs break-all font-mono text-default-700"
                data-cy="sso-provider-form-authentik-regex"
              >
                {hasSetupUrls ? authentikRedirectRegexPattern : t('setupUrlPending')}
              </code>
              {hasSetupUrls && (
                <Tooltip>
                  <Button
                    variant="ghost"
                    isIconOnly
                    size="sm"
                    onPress={() => onCopy(authentikRedirectRegexPattern)}
                    data-cy="sso-provider-form-authentik-regex-copy-button"
                  >
                    <Copy size={16} />
                  </Button>
                  <TooltipContent>{t('copy')}</TooltipContent>
                </Tooltip>
              )}
            </dd>
            <p className="text-xs text-default-500">
              {hasSetupUrls ? t('authentikRedirectRegexDescription') : t('setupUrlPending')}
            </p>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <dt className="text-sm font-medium">{isSamlProvider ? t('samlAcsUrl') : t('oidcRedirectUri')}</dt>
          <dd className="flex items-center gap-2 rounded-md border border-default-200 bg-default-50 px-3 py-2">
            <code className="flex-1 text-xs break-all font-mono text-default-700" data-cy="sso-provider-form-callback-url">
              {hasSetupUrls ? (isSamlProvider ? samlCallbackUrl : oidcCallbackUrl) : t('setupUrlPending')}
            </code>
            {hasSetupUrls && (
              <Tooltip>
                <Button
                  variant="ghost"
                  isIconOnly
                  size="sm"
                  onPress={() => onCopy(isSamlProvider ? samlCallbackUrl : oidcCallbackUrl)}
                  data-cy="sso-provider-form-callback-url-copy-button"
                >
                  <Copy size={16} />
                </Button>
                <TooltipContent>{t('copy')}</TooltipContent>
              </Tooltip>
            )}
          </dd>
          <p className="text-xs text-default-500">
            {hasSetupUrls
              ? isSamlProvider
                ? t('samlAcsUrlDescription')
                : t('oidcRedirectUriDescription')
              : t('setupUrlPending')}
          </p>
        </div>
      </dl>

      <div className="flex flex-wrap gap-3 text-xs">
        {docsSsoProvidersUrl && <Link href={docsSsoProvidersUrl}>{t('docsSsoProviders')}</Link>}
        {docsAuthentikPermissionsUrl && <Link href={docsAuthentikPermissionsUrl}>{t('docsAuthentikPermissions')}</Link>}
      </div>
    </section>
  );
};
