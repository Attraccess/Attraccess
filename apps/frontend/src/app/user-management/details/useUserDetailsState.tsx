import {
  ApiError,
  SSOProvider,
  SSOProviderType,
  User,
  useAuthenticationServiceGetAllSsoProviders,
  useLicenseServiceGetLicenseInformation,
  useUsersServiceDeleteUser,
  useUsersServiceGetOneUserById,
} from '@attraccess/react-query-client';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { useOverlayState } from '@heroui/react';
import { useToastMessage } from '../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_EN from '../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../global-translations/api-errors.de.json';
import { useAuth } from '../../../hooks/useAuth';
import { useMemo } from 'react';
import { getSsoManagedPermissionKeys, hasConfiguredPermissionMapping } from '@attraccess/shared';

export function useUserDetailsState({ id, roleIdToAssign }: { id: number; roleIdToAssign?: number }) {
  const { t, tExists } = useTranslations({
    en: { ...en, apiErrors: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, apiErrors: API_ERROR_TRANSLATIONS_DE },
  });

  const navigate = useNavigate();
  const toast = useToastMessage();
  const { isOpen, open, setOpen } = useOverlayState();
  const { user: me, hasPermission } = useAuth();

  const { data: user } = useUsersServiceGetOneUserById({ id });
  const { data: license } = useLicenseServiceGetLicenseInformation();
  const { data: ssoProviders } = useAuthenticationServiceGetAllSsoProviders(undefined, {
    enabled: license?.modules.includes('sso'),
  });

  const providersById = useMemo(
    () => new Map((ssoProviders ?? []).map((provider: SSOProvider) => [provider.id, provider])),
    [ssoProviders],
  );
  type AuthenticationDetailSummary = {
    providerId?: number | null;
    providerType?: string | null;
    ssoSubject?: string | null;
    type?: string | null;
  };
  type UserWithAuthDetails = Omit<User, 'authenticationDetails'> & {
    authenticationDetails?: AuthenticationDetailSummary[];
  };
  const ssoDetails = useMemo(
    () =>
      (user as UserWithAuthDetails | undefined)?.authenticationDetails?.filter(
        (detail) => detail.ssoSubject || detail.providerId || detail.providerType,
      ) ?? [],
    [user],
  );

  const ssoManagedProviders = useMemo(() => {
    if (ssoDetails.length === 0) {
      return [];
    }

    const labels = new Set<string>();

    ssoDetails.forEach((detail) => {
      if (!detail.providerId || !detail.providerType) {
        return;
      }

      const provider = providersById.get(detail.providerId);
      if (!provider) {
        return;
      }

      const roleMappings =
        detail.providerType === SSOProviderType.OIDC
          ? provider.oidcConfiguration?.roleMappings
          : detail.providerType === SSOProviderType.SAML
            ? provider.samlConfiguration?.roleMappings
            : undefined;

      if (hasConfiguredPermissionMapping(roleMappings)) {
        labels.add(provider.name ?? `${detail.providerType} #${detail.providerId}`);
      }
    });

    return Array.from(labels);
  }, [providersById, ssoDetails]);

  const ssoManagedPermissionKeys = useMemo(() => {
    const keys = new Set<string>();

    ssoDetails.forEach((detail) => {
      if (!detail.providerId || !detail.providerType) {
        return;
      }

      const provider = providersById.get(detail.providerId);
      if (!provider) {
        return;
      }

      const roleMappings =
        detail.providerType === SSOProviderType.OIDC
          ? provider.oidcConfiguration?.roleMappings
          : detail.providerType === SSOProviderType.SAML
            ? provider.samlConfiguration?.roleMappings
            : undefined;

      getSsoManagedPermissionKeys(roleMappings).forEach((key) => keys.add(key));
    });

    return keys;
  }, [providersById, ssoDetails]);

  const isSelf = !!me && !!user && me.id === user.id;
  const { mutate: deleteUser, isPending: isDeleting } = useUsersServiceDeleteUser({
    onSuccess: () => {
      toast.success({
        title: t('delete.success.title'),
        description: t('delete.success.description', { username: user?.username ?? '' }),
      });
      navigate('/users');
    },
    onError: (error) => {
      toast.apiError({
        error: error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'apiErrors',
      });
    },
  });
  return {
    t,
    navigate,
    isOpen,
    open,
    setOpen,
    hasPermission,
    user,
    license,
    providersById,
    ssoDetails,
    ssoManagedProviders,
    ssoManagedPermissionKeys,
    isSelf,
    deleteUser,
    isDeleting,
    id,
    roleIdToAssign,
  };
}
