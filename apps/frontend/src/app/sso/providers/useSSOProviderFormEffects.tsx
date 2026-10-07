import React, { useCallback } from 'react';
import { CreateSSOProviderDto, SSOProviderType } from '@attraccess/react-query-client';
import {
  buildRoleMappingEntries,
  ensureOidcConfiguration,
  ensureSamlConfiguration,
  getDefaultOidcConfiguration,
  getDefaultSamlConfiguration,
} from './formDefaults';
import type { useSSOProviderFormInputs } from './useSSOProviderFormInputs';

export function useSSOProviderFormEffects(model: ReturnType<typeof useSSOProviderFormInputs>) {
  const {
    providerDetails,
    setScopesInput,
    setUsernameClaimPathsInput,
    setEmailClaimPathsInput,
    setOidcRoleMappingEntries,
    setEmailAttributeKeysInput,
    setSamlRoleMappingEntries,
    setFormValues,
  } = model;
  // Populate form values when editing and the provider details are loaded
  React.useEffect(() => {
    if (!providerDetails) {
      return;
    }

    const extendedProvider = providerDetails;
    const updatedFormValues: CreateSSOProviderDto = {
      name: extendedProvider.name,
      type: extendedProvider.type as SSOProviderType,
      oidcConfiguration: getDefaultOidcConfiguration(),
      samlConfiguration: getDefaultSamlConfiguration(),
    };

    if (extendedProvider.type === SSOProviderType.OIDC && extendedProvider.oidcConfiguration) {
      updatedFormValues.oidcConfiguration = {
        issuer: extendedProvider.oidcConfiguration.issuer ?? '',
        authorizationURL: extendedProvider.oidcConfiguration.authorizationURL ?? '',
        tokenURL: extendedProvider.oidcConfiguration.tokenURL ?? '',
        userInfoURL: extendedProvider.oidcConfiguration.userInfoURL ?? '',
        clientId: extendedProvider.oidcConfiguration.clientId ?? '',
        clientSecret: extendedProvider.oidcConfiguration.clientSecret ?? '',
      };

      setScopesInput(
        Array.isArray(extendedProvider.oidcConfiguration.scopes)
          ? extendedProvider.oidcConfiguration.scopes.join(', ')
          : '',
      );
      setUsernameClaimPathsInput(
        Array.isArray(extendedProvider.oidcConfiguration.usernameClaimPaths)
          ? extendedProvider.oidcConfiguration.usernameClaimPaths.join(', ')
          : '',
      );
      setEmailClaimPathsInput(
        Array.isArray(extendedProvider.oidcConfiguration.emailClaimPaths)
          ? extendedProvider.oidcConfiguration.emailClaimPaths.join(', ')
          : '',
      );
      setOidcRoleMappingEntries(
        buildRoleMappingEntries(
          (extendedProvider.oidcConfiguration.roleMappings ?? undefined) as Record<string, string[]> | undefined,
        ),
      );
    } else {
      setScopesInput('');
      setUsernameClaimPathsInput('');
      setEmailClaimPathsInput('');
      setOidcRoleMappingEntries([]);
    }

    if (extendedProvider.type === SSOProviderType.SAML && extendedProvider.samlConfiguration) {
      updatedFormValues.samlConfiguration = {
        entryPoint: extendedProvider.samlConfiguration.entryPoint ?? '',
        issuer: extendedProvider.samlConfiguration.issuer ?? '',
        certificate: extendedProvider.samlConfiguration.certificate ?? '',
        audience: extendedProvider.samlConfiguration.audience ?? '',
        signRequest: extendedProvider.samlConfiguration.signRequest ?? false,
        wantAssertionsSigned: extendedProvider.samlConfiguration.wantAssertionsSigned ?? false,
        wantAuthnResponseSigned: extendedProvider.samlConfiguration.wantAuthnResponseSigned ?? true,
        forceAuthn: extendedProvider.samlConfiguration.forceAuthn ?? false,
        provisioningSecret: '',
        spSigningCertificate: extendedProvider.samlConfiguration.spSigningCertificate ?? '',
        spSigningPrivateKey: '',
      };
      setEmailAttributeKeysInput(
        Array.isArray(extendedProvider.samlConfiguration.emailAttributeKeys)
          ? extendedProvider.samlConfiguration.emailAttributeKeys.join(', ')
          : '',
      );
      setSamlRoleMappingEntries(
        buildRoleMappingEntries(
          (extendedProvider.samlConfiguration.roleMappings ?? undefined) as Record<string, string[]> | undefined,
        ),
      );
    } else {
      setEmailAttributeKeysInput('');
      setSamlRoleMappingEntries([]);
    }

    setFormValues(updatedFormValues);
  }, [
    providerDetails,
    setFormValues,
    setScopesInput,
    setUsernameClaimPathsInput,
    setEmailClaimPathsInput,
    setOidcRoleMappingEntries,
    setEmailAttributeKeysInput,
    setSamlRoleMappingEntries,
  ]);

  const setOidc = useCallback(
    (field: keyof NonNullable<CreateSSOProviderDto['oidcConfiguration']>, value: string) => {
      setFormValues((prev) => ({
        ...prev,
        oidcConfiguration: { ...ensureOidcConfiguration(prev.oidcConfiguration), [field]: value },
      }));
    },
    [setFormValues],
  );

  const setSaml = useCallback(
    (field: keyof NonNullable<CreateSSOProviderDto['samlConfiguration']>, value: string) => {
      setFormValues((prev) => ({
        ...prev,
        samlConfiguration: { ...ensureSamlConfiguration(prev.samlConfiguration), [field]: value },
      }));
    },
    [setFormValues],
  );
  return { ...model, setOidc, setSaml } as const;
}
