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
import { AuthentikDiscoveryDialog } from '../discovery/authentik';
import { KeycloakDiscoveryDialog } from '../discovery/keycloak';
import { RoleMappingsSection } from './RoleMappingsSection';
import { SSOProviderFormApi } from '../useSSOProviderForm';
import { useOIDCConfigFormState } from './useOIDCConfigFormState';

export interface OIDCConfigFormProps {
  form: SSOProviderFormApi;
}

export function OIDCConfigForm({ form }: OIDCConfigFormProps) {
  const model = useOIDCConfigFormState({ form });

  return (
    <>
      <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
            {model.t('sections.oidcEndpoints')}
          </h3>
          <AuthentikDiscoveryDialog onDiscovery={model.onAutoDiscovery}>
            {(onOpenAuthentikDiscovery) => (
              <KeycloakDiscoveryDialog onDiscovery={model.onAutoDiscovery}>
                {(onOpenKeycloakDiscovery) => (
                  <Dropdown>
                    <DropdownTrigger className={buttonVariants({ variant: 'ghost' })}>
                      <MoreVertical className="w-4 h-4" />
                      {model.t('autoDiscovery.label')}
                    </DropdownTrigger>
                    <DropdownPopover>
                      <DropdownMenu aria-label="OIDC auto discovery options">
                        <DropdownItem
                          key="authentik"
                          id="authentik"
                          onPress={onOpenAuthentikDiscovery}
                          data-cy="sso-provider-form-authentik-discovery-button"
                        >
                          {model.t('autoDiscovery.authentik')}
                        </DropdownItem>

                        <DropdownItem
                          key="keycloak"
                          id="keycloak"
                          onPress={onOpenKeycloakDiscovery}
                          data-cy="sso-provider-form-keycloak-discovery-button"
                        >
                          {model.t('autoDiscovery.keycloak')}
                        </DropdownItem>
                      </DropdownMenu>
                    </DropdownPopover>
                  </Dropdown>
                )}
              </KeycloakDiscoveryDialog>
            )}
          </AuthentikDiscoveryDialog>
        </div>

        <TextField
          isRequired
          value={model.formValues.oidcConfiguration?.issuer ?? ''}
          onChange={(v) => model.setOidc('issuer', v)}
        >
          <Label>{model.t('issuer')}</Label>
          <Input
            placeholder="https://sso.example.com/auth/realms/example"
            data-cy="sso-provider-form-oidc-issuer-input"
          />
        </TextField>

        <TextField
          isRequired
          value={model.formValues.oidcConfiguration?.authorizationURL ?? ''}
          onChange={(v) => model.setOidc('authorizationURL', v)}
        >
          <Label>{model.t('authorizationURL')}</Label>
          <Input
            placeholder="https://sso.example.com/auth/realms/example/protocol/openid-connect/auth"
            data-cy="sso-provider-form-oidc-authorization-url-input"
          />
        </TextField>

        <TextField
          isRequired
          value={model.formValues.oidcConfiguration?.tokenURL ?? ''}
          onChange={(v) => model.setOidc('tokenURL', v)}
        >
          <Label>{model.t('tokenURL')}</Label>
          <Input
            placeholder="https://sso.example.com/auth/realms/example/protocol/openid-connect/token"
            data-cy="sso-provider-form-oidc-token-url-input"
          />
        </TextField>

        <TextField
          isRequired
          value={model.formValues.oidcConfiguration?.userInfoURL ?? ''}
          onChange={(v) => model.setOidc('userInfoURL', v)}
        >
          <Label>{model.t('userInfoURL')}</Label>
          <Input
            placeholder="https://sso.example.com/auth/realms/example/protocol/openid-connect/userinfo"
            data-cy="sso-provider-form-oidc-user-info-url-input"
          />
        </TextField>
      </section>

      <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {model.t('sections.oidcCredentials')}
        </h3>
        <TextField
          isRequired
          value={model.formValues.oidcConfiguration?.clientId ?? ''}
          onChange={(v) => model.setOidc('clientId', v)}
        >
          <Label>{model.t('clientId')}</Label>
          <Input placeholder="your-client-id" data-cy="sso-provider-form-oidc-client-id-input" />
        </TextField>

        <TextField
          isRequired
          value={model.formValues.oidcConfiguration?.clientSecret ?? ''}
          onChange={(v) => model.setOidc('clientSecret', v)}
        >
          <Label>{model.t('clientSecret')}</Label>
          <InputGroup>
            <InputGroup.Input
              type={model.showClientSecret ? 'text' : 'password'}
              placeholder="••••••••••••••••"
              data-cy="sso-provider-form-oidc-client-secret-input"
            />
            <InputGroup.Suffix>
              <Tooltip>
                <Button
                  variant="ghost"
                  isIconOnly
                  onPress={() => model.setShowClientSecret(!model.showClientSecret)}
                  data-cy="sso-provider-form-oidc-toggle-client-secret-button"
                >
                  {model.showClientSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                </Button>
                <TooltipContent>
                  {model.showClientSecret ? model.t('hideClientSecret') : model.t('showClientSecret')}
                </TooltipContent>
              </Tooltip>
            </InputGroup.Suffix>
          </InputGroup>
        </TextField>
      </section>

      <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {model.t('sections.oidcClaims')}
        </h3>
        <TextField value={model.scopesInput} onChange={model.setScopesInput}>
          <Label>{model.t('scopes')}</Label>
          <Input placeholder="openid, email, profile" data-cy="sso-provider-form-oidc-scopes-input" />
        </TextField>
        <TextField value={model.usernameClaimPathsInput} onChange={model.setUsernameClaimPathsInput}>
          <Label>{model.t('usernameClaimPaths')}</Label>
          <Input placeholder="preferred_username, email, sub" data-cy="sso-provider-form-oidc-username-claims-input" />
        </TextField>
        <TextField value={model.emailClaimPathsInput} onChange={model.setEmailClaimPathsInput}>
          <Label>{model.t('emailClaimPaths')}</Label>
          <Input placeholder="email, emails[0].value, upn" data-cy="sso-provider-form-oidc-email-claims-input" />
        </TextField>
      </section>

      <RoleMappingsSection
        variant="oidc"
        roles={model.roles}
        isLoadingRoles={model.isLoadingRoles}
        entries={model.oidcRoleMappingEntries}
        onChange={model.setOidcRoleMappingEntries}
      />
    </>
  );
}
