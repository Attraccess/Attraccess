import {
  Description,
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
import { AuthentikDiscoveryDialog } from '../discovery/authentik/index';
import { KeycloakDiscoveryDialog } from '../discovery/keycloak/index';
import { RoleMappingsSection } from './RoleMappingsSection';
import { PermissionSyncSection } from './PermissionSyncSection';
import { SSOProviderFormApi } from '../useSSOProviderForm';
import { Button, StringListField, useTranslations } from '@attraccess/plugins-frontend-ui';
import { DEFAULT_OIDC_ROLE_CLAIM_PATHS, ROLE_PATH_LIST_MAX_ENTRIES, ROLE_PATH_MAX_LENGTH } from '@attraccess/shared';
import en from '../en.json';
import de from '../de.json';

const USERNAME_CLAIM_PATHS_DEFAULT = 'preferred_username · email · sub';
const EMAIL_CLAIM_PATHS_DEFAULT = 'email · emails[0].value · upn';
const ROLE_CLAIM_PATHS_DEFAULT = [...DEFAULT_OIDC_ROLE_CLAIM_PATHS, 'resource_access.<clientId>.roles'].join(' · ');

export interface OIDCConfigFormProps {
  form: SSOProviderFormApi;
}

export function OIDCConfigForm({ form }: OIDCConfigFormProps) {
  const { t } = useTranslations({ en, de });
  const {
    formValues,
    setOidc,
    scopes,
    setScopes,
    usernameClaimPaths,
    setUsernameClaimPaths,
    emailClaimPaths,
    setEmailClaimPaths,
    roleClaimPaths,
    setRoleClaimPaths,
    showClientSecret,
    setShowClientSecret,
    onAutoDiscovery,
    oidcRoleMappingEntries,
    setOidcRoleMappingEntries,
    roles,
    isLoadingRoles,
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

        <TextField
          value={formValues.oidcConfiguration?.endSessionURL ?? ''}
          onChange={(v) => setOidc('endSessionURL', v)}
        >
          <Label>{t('endSessionURL')}</Label>
          <Input placeholder="https://sso.example.com/logout" />
        </TextField>
        <TextField value={formValues.oidcConfiguration?.jwksURL ?? ''} onChange={(v) => setOidc('jwksURL', v)}>
          <Label>{t('jwksURL')}</Label>
          <Input placeholder="https://sso.example.com/jwks" />
        </TextField>
        <StringListField
          label={t('signingAlgorithms')}
          values={formValues.oidcConfiguration?.signingAlgorithms ?? []}
          onChange={(values) => setOidc('signingAlgorithms', values)}
          placeholder="RS256"
          emptyHint={t('signingAlgorithmsEmptyHint')}
          data-cy="sso-provider-form-oidc-signing-algorithms-input"
        />
        <p className="text-sm text-muted">{t('oidcLogoutHint')}</p>

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
        <StringListField
          label={t('scopes')}
          values={scopes}
          onChange={setScopes}
          placeholder="email"
          emptyHint={t('scopesEmptyHint')}
          data-cy="sso-provider-form-oidc-scopes-input"
        />
        <StringListField
          label={t('usernameClaimPaths')}
          values={usernameClaimPaths}
          onChange={setUsernameClaimPaths}
          placeholder="preferred_username"
          emptyHint={t('defaultsUsed', { defaults: USERNAME_CLAIM_PATHS_DEFAULT })}
          data-cy="sso-provider-form-oidc-username-claims-input"
        />
        <StringListField
          label={t('emailClaimPaths')}
          values={emailClaimPaths}
          onChange={setEmailClaimPaths}
          placeholder="email"
          emptyHint={t('defaultsUsed', { defaults: EMAIL_CLAIM_PATHS_DEFAULT })}
          data-cy="sso-provider-form-oidc-email-claims-input"
        />
        <StringListField
          label={t('roleClaimPaths')}
          description={t('roleClaimPathsHint')}
          values={roleClaimPaths}
          onChange={setRoleClaimPaths}
          placeholder="realm_access.roles"
          emptyHint={t('defaultsUsed', { defaults: ROLE_CLAIM_PATHS_DEFAULT })}
          maxEntries={ROLE_PATH_LIST_MAX_ENTRIES}
          maxLength={ROLE_PATH_MAX_LENGTH}
          data-cy="sso-provider-form-oidc-role-claims-input"
        />
      </section>

      <RoleMappingsSection
        variant="oidc"
        roles={roles}
        isLoadingRoles={isLoadingRoles}
        entries={oidcRoleMappingEntries}
        onChange={setOidcRoleMappingEntries}
      />

      <PermissionSyncSection
        value={formValues.oidcConfiguration?.permissionSyncTtlMinutes}
        onChange={(value) => setOidc('permissionSyncTtlMinutes', value)}
      />
    </>
  );
}
