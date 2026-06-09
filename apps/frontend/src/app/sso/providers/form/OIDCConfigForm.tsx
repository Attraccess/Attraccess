import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownTrigger,
  Input,
  InputGroup,
  Label,
  TextField,
  Tooltip,
  TooltipContent,
} from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { Eye, EyeOff, MoreVertical } from 'lucide-react';
import { Button } from '../../../../components/button';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { AuthentikDiscoveryDialog } from '../discovery/authentik';
import { KeycloakDiscoveryDialog } from '../discovery/keycloak';
import { PermissionMappingsSection } from './PermissionMappingsSection';
import { SSOProviderFormApi } from '../useSSOProviderForm';
import en from '../en.json';
import de from '../de.json';

interface OIDCConfigFormProps {
  form: SSOProviderFormApi;
}

export const OIDCConfigForm = ({ form }: OIDCConfigFormProps) => {
  const { t } = useTranslations({ en, de });
  const {
    formValues,
    setOidc,
    scopesInput,
    setScopesInput,
    usernameClaimPathsInput,
    setUsernameClaimPathsInput,
    emailClaimPathsInput,
    setEmailClaimPathsInput,
    showClientSecret,
    setShowClientSecret,
    onAutoDiscovery,
    oidcPermissionMappingsInput,
    setOidcPermissionMappingsInput,
  } = form;

  return (
    <>
      <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
            {t('sections.oidcEndpoints')}
          </h3>
          <AuthentikDiscoveryDialog onDiscovery={onAutoDiscovery}>
            {(onOpenAuthentikDiscovery) => (
              <KeycloakDiscoveryDialog onDiscovery={onAutoDiscovery}>
                {(onOpenKeycloakDiscovery) => (
                  <Dropdown>
                    <DropdownTrigger className={buttonVariants({ variant: 'ghost' })}>
                      <MoreVertical className="w-4 h-4" />
                      {t('autoDiscovery.label')}
                    </DropdownTrigger>
                    <DropdownPopover>
                      <DropdownMenu aria-label="OIDC auto discovery options">
                        <DropdownItem
                          key="authentik"
                          id="authentik"
                          onPress={onOpenAuthentikDiscovery}
                          data-cy="sso-provider-form-authentik-discovery-button"
                        >
                          {t('autoDiscovery.authentik')}
                        </DropdownItem>

                        <DropdownItem
                          key="keycloak"
                          id="keycloak"
                          onPress={onOpenKeycloakDiscovery}
                          data-cy="sso-provider-form-keycloak-discovery-button"
                        >
                          {t('autoDiscovery.keycloak')}
                        </DropdownItem>
                      </DropdownMenu>
                    </DropdownPopover>
                  </Dropdown>
                )}
              </KeycloakDiscoveryDialog>
            )}
          </AuthentikDiscoveryDialog>
        </div>

        <TextField isRequired value={formValues.oidcConfiguration?.issuer ?? ''} onChange={(v) => setOidc('issuer', v)}>
          <Label>{t('issuer')}</Label>
          <Input
            placeholder="https://sso.example.com/auth/realms/example"
            data-cy="sso-provider-form-oidc-issuer-input"
          />
        </TextField>

        <TextField
          isRequired
          value={formValues.oidcConfiguration?.authorizationURL ?? ''}
          onChange={(v) => setOidc('authorizationURL', v)}
        >
          <Label>{t('authorizationURL')}</Label>
          <Input
            placeholder="https://sso.example.com/auth/realms/example/protocol/openid-connect/auth"
            data-cy="sso-provider-form-oidc-authorization-url-input"
          />
        </TextField>

        <TextField
          isRequired
          value={formValues.oidcConfiguration?.tokenURL ?? ''}
          onChange={(v) => setOidc('tokenURL', v)}
        >
          <Label>{t('tokenURL')}</Label>
          <Input
            placeholder="https://sso.example.com/auth/realms/example/protocol/openid-connect/token"
            data-cy="sso-provider-form-oidc-token-url-input"
          />
        </TextField>

        <TextField
          isRequired
          value={formValues.oidcConfiguration?.userInfoURL ?? ''}
          onChange={(v) => setOidc('userInfoURL', v)}
        >
          <Label>{t('userInfoURL')}</Label>
          <Input
            placeholder="https://sso.example.com/auth/realms/example/protocol/openid-connect/userinfo"
            data-cy="sso-provider-form-oidc-user-info-url-input"
          />
        </TextField>
      </section>

      <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {t('sections.oidcCredentials')}
        </h3>
        <TextField
          isRequired
          value={formValues.oidcConfiguration?.clientId ?? ''}
          onChange={(v) => setOidc('clientId', v)}
        >
          <Label>{t('clientId')}</Label>
          <Input placeholder="your-client-id" data-cy="sso-provider-form-oidc-client-id-input" />
        </TextField>

        <TextField
          isRequired
          value={formValues.oidcConfiguration?.clientSecret ?? ''}
          onChange={(v) => setOidc('clientSecret', v)}
        >
          <Label>{t('clientSecret')}</Label>
          <InputGroup>
            <InputGroup.Input
              type={showClientSecret ? 'text' : 'password'}
              placeholder="••••••••••••••••"
              data-cy="sso-provider-form-oidc-client-secret-input"
            />
            <InputGroup.Suffix>
              <Tooltip>
                <Button
                  variant="ghost"
                  isIconOnly
                  onPress={() => setShowClientSecret(!showClientSecret)}
                  data-cy="sso-provider-form-oidc-toggle-client-secret-button"
                >
                  {showClientSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                </Button>
                <TooltipContent>{showClientSecret ? t('hideClientSecret') : t('showClientSecret')}</TooltipContent>
              </Tooltip>
            </InputGroup.Suffix>
          </InputGroup>
        </TextField>
      </section>

      <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('sections.oidcClaims')}</h3>
        <TextField value={scopesInput} onChange={setScopesInput}>
          <Label>{t('scopes')}</Label>
          <Input placeholder="openid, email, profile" data-cy="sso-provider-form-oidc-scopes-input" />
        </TextField>
        <TextField value={usernameClaimPathsInput} onChange={setUsernameClaimPathsInput}>
          <Label>{t('usernameClaimPaths')}</Label>
          <Input placeholder="preferred_username, email, sub" data-cy="sso-provider-form-oidc-username-claims-input" />
        </TextField>
        <TextField value={emailClaimPathsInput} onChange={setEmailClaimPathsInput}>
          <Label>{t('emailClaimPaths')}</Label>
          <Input placeholder="email, emails[0].value, upn" data-cy="sso-provider-form-oidc-email-claims-input" />
        </TextField>
      </section>

      <PermissionMappingsSection
        variant="oidc"
        values={oidcPermissionMappingsInput}
        onChange={(key, value) => setOidcPermissionMappingsInput((prev) => ({ ...prev, [key]: value }))}
      />
    </>
  );
};
