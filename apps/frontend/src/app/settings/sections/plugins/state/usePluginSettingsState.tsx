import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  usePluginsServiceGetPluginSystemStatus,
  usePluginsServiceGetPlugins,
  usePluginsServicePluginControllerAddRegistry,
  usePluginsServicePluginControllerCheckAllInstalledPackages,
  usePluginsServicePluginControllerDependencyPlan,
  usePluginsServicePluginControllerInstallPackage,
  usePluginsServicePluginControllerRemovalPlan,
  usePluginsServicePluginControllerRemovePackageGraph,
  usePluginsServicePluginControllerRemoveRegistry,
  usePluginsServicePluginControllerReplaceInstalledPackage,
  usePluginsServicePluginControllerTestRegistry,
  usePluginsServicePluginControllerUpdateInstalledPackagePolicy,
  usePluginsServiceRetryPlugin,
} from '@attraccess/react-query-client';
import { useRef, useState } from 'react';
import { useToastMessage } from '../../../../../components/toastProvider';
import de from '../de.json';
import en from '../en.json';
import type {
  InstalledNpmPlugin,
  MarketplacePlugin,
  PluginInstallPlan,
  Registry,
  VersionCandidate,
  VersionPlugin,
} from '../types';

export function usePluginRegistryState() {
  const [registries, setRegistries] = useState<Registry[]>([]);
  const [registryName, setRegistryName] = useState('');
  const [registryUrl, setRegistryUrl] = useState('');
  const [registryToken, setRegistryToken] = useState('');
  const [isSavingRegistry, setIsSavingRegistry] = useState(false);
  const [testingRegistryId, setTestingRegistryId] = useState<string | null>(null);
  return {
    registries,
    setRegistries,
    registryName,
    setRegistryName,
    registryUrl,
    setRegistryUrl,
    registryToken,
    setRegistryToken,
    isSavingRegistry,
    setIsSavingRegistry,
    testingRegistryId,
    setTestingRegistryId,
  };
}

export function usePluginVersionSelection() {
  const [versionPlugin, setVersionPlugin] = useState<VersionPlugin | null>(null);
  const [versions, setVersions] = useState<VersionCandidate[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<VersionCandidate | null>(null);
  const [permissionApproved, setPermissionApproved] = useState(false);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [requestedSpec, setRequestedSpec] = useState('');
  const [updateOverride, setUpdateOverride] = useState<InstalledNpmPlugin['updateOverride']>('inherit');
  const [approvedVersionPlanToken, setApprovedVersionPlanToken] = useState<string | null>(null);
  const [majorApproved, setMajorApproved] = useState(false);
  const [approvedInstallPlanToken, setApprovedInstallPlanToken] = useState<string | null>(null);
  return {
    versionPlugin,
    setVersionPlugin,
    versions,
    setVersions,
    selectedVersion,
    setSelectedVersion,
    permissionApproved,
    setPermissionApproved,
    isLoadingVersions,
    setIsLoadingVersions,
    isReplacing,
    setIsReplacing,
    requestedSpec,
    setRequestedSpec,
    updateOverride,
    setUpdateOverride,
    approvedVersionPlanToken,
    setApprovedVersionPlanToken,
    majorApproved,
    setMajorApproved,
    approvedInstallPlanToken,
    setApprovedInstallPlanToken,
  };
}

export function usePluginsSectionStateInputs() {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const registryState = usePluginRegistryState();
  const versionState = usePluginVersionSelection();
  const { versionPlugin, selectedVersion } = versionState;

  const { data: plugins } = usePluginsServiceGetPlugins();
  const { data: pluginSystemStatus, refetch: refetchPluginSystemStatus } = usePluginsServiceGetPluginSystemStatus();
  const { mutateAsync: checkAllInstalledPackages, isPending: isCheckingForUpdates } =
    usePluginsServicePluginControllerCheckAllInstalledPackages<InstalledNpmPlugin[]>();
  const { mutateAsync: addPluginRegistry } = usePluginsServicePluginControllerAddRegistry<Registry>();
  const { mutateAsync: testPluginRegistry } = usePluginsServicePluginControllerTestRegistry();
  const { mutateAsync: removePluginRegistry } = usePluginsServicePluginControllerRemoveRegistry();
  const { mutateAsync: installPluginPackage } = usePluginsServicePluginControllerInstallPackage<InstalledNpmPlugin>();
  const { mutateAsync: replaceInstalledPlugin } =
    usePluginsServicePluginControllerReplaceInstalledPackage<InstalledNpmPlugin>();
  const { mutateAsync: updateInstalledPluginPolicy } =
    usePluginsServicePluginControllerUpdateInstalledPackagePolicy<InstalledNpmPlugin>();
  const { mutateAsync: retryFailedPlugin } = usePluginsServiceRetryPlugin();
  const pluginsDisabled = pluginSystemStatus?.disabled === true;
  const [failedPlugin, setFailedPlugin] = useState<{ id: string; name: string; error: string } | null>(null);
  const [isRetryingPlugin, setIsRetryingPlugin] = useState(false);
  const [pluginToDelete, setPluginToDelete] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [npmPluginNames, setNpmPluginNames] = useState<Set<string>>(new Set());
  const [installedNpmPlugins, setInstalledNpmPlugins] = useState<Map<string, InstalledNpmPlugin>>(new Map());
  const [isMarketplaceOpen, setIsMarketplaceOpen] = useState(false);
  const [marketplaceQuery, setMarketplaceQuery] = useState('');
  const [selectedRegistryId, setSelectedRegistryId] = useState('');
  const [marketplacePlugins, setMarketplacePlugins] = useState<MarketplacePlugin[]>([]);
  const [isLoadingMarketplaceSearch, setIsLoadingMarketplaceSearch] = useState(false);
  const [isLoadingMarketplaceDetail, setIsLoadingMarketplaceDetail] = useState(false);
  const [marketplacePlugin, setMarketplacePlugin] = useState<MarketplacePlugin | null>(null);
  const [pluginToInstall, setPluginToInstall] = useState<MarketplacePlugin | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installFailure, setInstallFailure] = useState<string | null>(null);
  const versionRequest = useRef(0);
  const marketplaceSearchRequest = useRef(0);
  const marketplaceDetailRequest = useRef(0);
  const registryRequest = useRef(0);
  const latestRegistryTest = useRef<symbol | null>(null);
  const isLoadingMarketplace = isLoadingMarketplaceSearch || isLoadingMarketplaceDetail;

  const [approvedRemovalPlan, setApprovedRemovalPlan] = useState<string | null>(null);
  const [removeFailure, setRemoveFailure] = useState<string | null>(null);
  const { mutateAsync: removePackageGraph, isPending: isRemovingGraph } =
    usePluginsServicePluginControllerRemovePackageGraph();
  const detailTarget = pluginToInstall ?? marketplacePlugin;
  const hasDependencies = Boolean(detailTarget?.dependencies?.length);
  const {
    data: dependencyPlan,
    error: planError,
    isFetching: isResolvingDependencies,
  } = usePluginsServicePluginControllerDependencyPlan<PluginInstallPlan>(
    {
      packageName: detailTarget?.name ?? '',
      spec: detailTarget?.version ?? undefined,
      registryId: detailTarget?.registry.id,
    },
    undefined,
    { enabled: hasDependencies, staleTime: 0, retry: false },
  );
  const hasVersionDependencies = Boolean(selectedVersion?.dependencies?.length);
  const {
    data: versionPlan,
    error: versionPlanError,
    isFetching: isResolvingVersionDependencies,
  } = usePluginsServicePluginControllerDependencyPlan<PluginInstallPlan>(
    {
      packageName: versionPlugin?.name ?? '',
      spec: selectedVersion?.version,
      registryId: versionPlugin ? installedNpmPlugins.get(versionPlugin.name)?.registryId : undefined,
    },
    undefined,
    { enabled: hasVersionDependencies, staleTime: 0, retry: false },
  );
  const deletingPlugin = plugins?.find((plugin) => plugin.id === pluginToDelete);
  const deletingNpm = deletingPlugin && npmPluginNames.has(deletingPlugin.name);
  const {
    data: removalPlan,
    error: removalPlanError,
    isFetching: isResolvingRemoval,
  } = usePluginsServicePluginControllerRemovalPlan<InstalledNpmPlugin[]>(
    { packageName: deletingPlugin?.name ?? '' },
    undefined,
    { enabled: Boolean(deletingNpm), staleTime: 0, retry: false },
  );
  const dependantsToRemove = removalPlan?.filter((plugin) => plugin.name !== deletingPlugin?.name) ?? [];
  return {
    ...registryState,
    ...versionState,
    t,
    toast,
    plugins,
    pluginSystemStatus,
    refetchPluginSystemStatus,
    checkAllInstalledPackages,
    isCheckingForUpdates,
    addPluginRegistry,
    testPluginRegistry,
    removePluginRegistry,
    installPluginPackage,
    replaceInstalledPlugin,
    updateInstalledPluginPolicy,
    retryFailedPlugin,
    pluginsDisabled,
    failedPlugin,
    setFailedPlugin,
    isRetryingPlugin,
    setIsRetryingPlugin,
    pluginToDelete,
    setPluginToDelete,
    isUploadOpen,
    setIsUploadOpen,
    npmPluginNames,
    setNpmPluginNames,
    installedNpmPlugins,
    setInstalledNpmPlugins,
    isMarketplaceOpen,
    setIsMarketplaceOpen,
    marketplaceQuery,
    setMarketplaceQuery,
    selectedRegistryId,
    setSelectedRegistryId,
    marketplacePlugins,
    setMarketplacePlugins,
    isLoadingMarketplaceSearch,
    setIsLoadingMarketplaceSearch,
    isLoadingMarketplaceDetail,
    setIsLoadingMarketplaceDetail,
    marketplacePlugin,
    setMarketplacePlugin,
    pluginToInstall,
    setPluginToInstall,
    isInstalling,
    setIsInstalling,
    installFailure,
    setInstallFailure,
    versionRequest,
    marketplaceSearchRequest,
    marketplaceDetailRequest,
    registryRequest,
    latestRegistryTest,
    isLoadingMarketplace,
    approvedRemovalPlan,
    setApprovedRemovalPlan,
    removeFailure,
    setRemoveFailure,
    removePackageGraph,
    isRemovingGraph,
    detailTarget,
    hasDependencies,
    dependencyPlan,
    planError,
    isResolvingDependencies,
    hasVersionDependencies,
    versionPlan,
    versionPlanError,
    isResolvingVersionDependencies,
    deletingPlugin,
    deletingNpm,
    removalPlan,
    removalPlanError,
    isResolvingRemoval,
    dependantsToRemove,
  } as const;
}

export const DOCS_URL = 'https://docs.attraccess.org/#/plugins/developing-plugins';
