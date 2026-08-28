import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  Chip,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownTrigger,
  Input,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  TextField,
  Tooltip,
  TooltipContent,
} from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { AlertTriangle, BookOpen, CheckCircle2, ChevronDown, Store, Trash2, Upload } from 'lucide-react';
import { usePluginsServiceDeletePlugin, usePluginsServiceGetPlugins } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { SettingsSection } from '../../components/SettingsSection';
import { Button } from '../../../../components/button';
import { StandardModal } from '../../../../components/standardModal';
import { StandardDrawer } from '../../../../components/standardDrawer';
import { EmptyState } from '../../../../components/emptyState';
import { useToastMessage } from '../../../../components/toastProvider';
import { UploadPluginModal } from '../../../plugins/UploadPluginModal';
import { getBaseUrl } from '../../../../api';
import en from './en.json';
import de from './de.json';
import { PluginClassificationBadge } from './PluginClassificationBadge';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { Select } from '../../../../components/select';

const DOCS_URL = 'https://docs.attraccess.org/#/plugins/developing-plugins';

type VersionCandidate = {
  version: string;
  publishedAt: string | null;
  direction: 'current' | 'newer' | 'older';
  compatible: boolean;
  reason: string | null;
  permissions: string[];
  permissionAdditions: string[];
  permissionRemovals: string[];
  deprecated: string | null;
  integrity: string | null;
  repository: string | null;
  homepage: string | null;
  semverImpact: 'major' | 'minor' | 'patch' | 'prerelease' | 'none';
  matchesRequestedSpec: boolean;
};

type InstalledNpmPlugin = {
  name: string;
  version: string;
  registryId: string;
  registryUrl: string;
  integrity: string;
  installPath: string;
  permissions: string[];
  lastError: string | null;
  classification: 'official' | 'community';
  classificationReason: string;
  requestedSpec: string;
  updateOverride: 'inherit' | 'off' | 'patch' | 'minor' | 'follow';
  updateCheck?: {
    checkedAt: string;
    candidate: string | null;
    state: 'up-to-date' | 'available' | 'blocked' | 'failed';
    error: string | null;
  } | null;
  publisher: string | null;
};

type VersionPlugin = Pick<InstalledNpmPlugin, 'name' | 'version'>;

type MarketplacePlugin = {
  name: string;
  version: string | null;
  displayName: string | null;
  description: string | null;
  permissions: string[];
  hostRange: string | null;
  sdkCompatibility: { backend: string | null; frontend: string | null };
  repository: string | null;
  homepage: string | null;
  license: string | null;
  publisher: string | null;
  deprecated: boolean;
  registry: { id: string; name: string; url: string };
  classification: 'official' | 'community';
  classificationReason: string;
  installable: boolean;
  incompatibilityReason: string | null;
  integrity: string | null;
  provenance: string | null;
};

type Registry = { id: string; name: string; url: string; tokenConfigured: boolean };

/**
 * Installed plugins. This is the one section on `system.plugins.manage` rather than
 * `system.settings.manage` — see the registry for why the narrower permission survived the move.
 *
 * Uploading and removing are actions against the plugin store, not edits to a form, so there is no
 * save bar; the table keeps its own confirmation modal.
 */
export function PluginsSection() {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();

  const { data: plugins } = usePluginsServiceGetPlugins();
  const [pluginToDelete, setPluginToDelete] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [versionPlugin, setVersionPlugin] = useState<VersionPlugin | null>(null);
  const [versions, setVersions] = useState<VersionCandidate[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<VersionCandidate | null>(null);
  const [permissionApproved, setPermissionApproved] = useState(false);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
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
  const [requestedSpec, setRequestedSpec] = useState('');
  const [updateOverride, setUpdateOverride] = useState<InstalledNpmPlugin['updateOverride']>('inherit');
  const [majorApproved, setMajorApproved] = useState(false);
  const [installApproved, setInstallApproved] = useState(false);
  const [registries, setRegistries] = useState<Registry[]>([]);
  const [registryName, setRegistryName] = useState('');
  const [registryUrl, setRegistryUrl] = useState('');
  const [registryToken, setRegistryToken] = useState('');
  const [isSavingRegistry, setIsSavingRegistry] = useState(false);
  const [testingRegistryId, setTestingRegistryId] = useState<string | null>(null);
  const versionRequest = useRef(0);
  const marketplaceSearchRequest = useRef(0);
  const marketplaceDetailRequest = useRef(0);
  const registryRequest = useRef(0);
  const latestRegistryTest = useRef<symbol | null>(null);
  const isLoadingMarketplace = isLoadingMarketplaceSearch || isLoadingMarketplaceDetail;

  useEffect(() => {
    if (!globalThis.fetch) return;
    void fetch(`${getBaseUrl()}/api/plugins/installed`, { credentials: 'include' })
      .then(async (response) => (response.ok ? (response.json() as Promise<InstalledNpmPlugin[]>) : []))
      .then((installed) => {
        setNpmPluginNames(new Set(installed.map(({ name }) => name)));
        setInstalledNpmPlugins(
          new Map<string, InstalledNpmPlugin>(installed.map((plugin) => [plugin.name, plugin] as const)),
        );
      })
      .catch(() => undefined);
  }, []);

  const loadRegistries = async () => {
    const request = ++registryRequest.current;
    try {
      const response = await fetch(`${getBaseUrl()}/api/plugins/registries`, { credentials: 'include' });
      if (!response.ok) throw new Error();
      const result = (await response.json()) as unknown;
      if (registryRequest.current === request) setRegistries(Array.isArray(result) ? (result as Registry[]) : []);
    } catch (error) {
      if (registryRequest.current === request) toast.error({ title: t('marketplace.registryLoadError') });
      throw error;
    }
  };

  const loadInitialRegistries = useEffectEvent(() => {
    void loadRegistries().catch(() => undefined);
  });

  useEffect(() => {
    if (globalThis.fetch) loadInitialRegistries();
  }, []);

  const loadMarketplace = async (query = marketplaceQuery) => {
    const request = ++marketplaceSearchRequest.current;
    setIsLoadingMarketplaceSearch(true);
    let result: { results: MarketplacePlugin[]; errors: string[] } = { results: [], errors: [] };
    let searchFailed = false;
    try {
      const response = await fetch(
        `${getBaseUrl()}/api/plugins/marketplace/search?query=${encodeURIComponent(query)}${selectedRegistryId ? `&registryId=${encodeURIComponent(selectedRegistryId)}` : ''}`,
        {
          credentials: 'include',
        },
      );
      if (!response.ok) searchFailed = true;
      else result = (await response.json()) as { results: MarketplacePlugin[]; errors: string[] };
    } catch {
      searchFailed = true;
    }

    let directPackage: MarketplacePlugin | null = null;
    if (selectedRegistryId && query.trim()) {
      try {
        const packageResponse = await fetch(
          `${getBaseUrl()}/api/plugins/marketplace/${encodeURIComponent(query.trim())}?registryId=${encodeURIComponent(selectedRegistryId)}`,
          { credentials: 'include' },
        );
        if (packageResponse.ok) directPackage = (await packageResponse.json()) as MarketplacePlugin;
      } catch {
        // Registry search results remain useful when an exact package lookup is unavailable.
      }
    }

    if (marketplaceSearchRequest.current === request) {
      const unique = new Map(
        [...result.results, ...(directPackage ? [directPackage] : [])].map((plugin) => [
          `${plugin.registry.id}:${plugin.name}`,
          plugin,
        ]),
      );
      setMarketplacePlugins([...unique.values()]);
      if (searchFailed && !directPackage) toast.error({ title: t('marketplace.loadError') });
      else if (result.errors.length > 0)
        toast.error({ title: t('marketplace.loadError'), description: result.errors.join(', ') });
    }
    if (marketplaceSearchRequest.current === request) setIsLoadingMarketplaceSearch(false);
  };

  const addRegistry = async () => {
    setIsSavingRegistry(true);
    try {
      const response = await fetch(`${getBaseUrl()}/api/plugins/registries`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: registryName, url: registryUrl, token: registryToken || undefined }),
      });
      if (!response.ok) throw new Error(await response.text());
      setRegistryName('');
      setRegistryUrl('');
      setRegistryToken('');
      await loadRegistries();
      toast.success({ title: t('marketplace.registryAdded') });
    } catch {
      toast.error({ title: t('marketplace.registrySaveError') });
    } finally {
      setIsSavingRegistry(false);
    }
  };

  const testRegistry = async (registryId: string) => {
    const request = Symbol(registryId);
    latestRegistryTest.current = request;
    setTestingRegistryId(registryId);
    try {
      const response = await fetch(`${getBaseUrl()}/api/plugins/registries/${encodeURIComponent(registryId)}/test`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error();
      toast.success({ title: t('marketplace.registryTestSuccess') });
    } catch {
      toast.error({ title: t('marketplace.registryTestError') });
    } finally {
      if (latestRegistryTest.current === request) {
        latestRegistryTest.current = null;
        setTestingRegistryId(null);
      }
    }
  };

  const removeRegistry = async (registryId: string) => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/plugins/registries/${encodeURIComponent(registryId)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error();
      if (selectedRegistryId === registryId) setSelectedRegistryId('');
      await loadRegistries();
    } catch {
      toast.error({ title: t('marketplace.registryRemoveError') });
    }
  };

  useEffect(() => {
    if (!isMarketplaceOpen || !globalThis.fetch) return;
    const timeout = window.setTimeout(() => void loadMarketplace(), marketplaceQuery.trim() ? 300 : 0);
    return () => window.clearTimeout(timeout);
  }, [isMarketplaceOpen, marketplaceQuery, selectedRegistryId]);

  const openMarketplacePlugin = async (plugin: MarketplacePlugin, closeMarketplace = false) => {
    const request = ++marketplaceDetailRequest.current;
    setIsLoadingMarketplaceDetail(true);
    try {
      const response = await fetch(
        `${getBaseUrl()}/api/plugins/marketplace/${encodeURIComponent(plugin.name)}?registryId=${encodeURIComponent(plugin.registry.id)}`,
        { credentials: 'include' },
      );
      if (!response.ok) throw new Error();
      const details = (await response.json()) as MarketplacePlugin;
      if (marketplaceDetailRequest.current === request) {
        setMarketplacePlugin(details);
        if (closeMarketplace) setIsMarketplaceOpen(false);
      }
    } catch {
      if (marketplaceDetailRequest.current === request) toast.error({ title: t('marketplace.loadError') });
    } finally {
      if (marketplaceDetailRequest.current === request) setIsLoadingMarketplaceDetail(false);
    }
  };

  const installMarketplacePlugin = async () => {
    if (!pluginToInstall?.version) return;
    setIsInstalling(true);
    try {
      const response = await fetch(
        `${getBaseUrl()}/api/plugins/npm/${encodeURIComponent(pluginToInstall.name)}/versions/${pluginToInstall.version}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ registryId: pluginToInstall.registry.id }),
        },
      );
      if (!response.ok) throw new Error();
      toast.success({ title: t('marketplace.installSuccess') });
      setTimeout(() => window.location.reload(), 5000);
      setPluginToInstall(null);
      setInstallApproved(false);
    } catch {
      toast.error({ title: t('marketplace.installError') });
    } finally {
      setIsInstalling(false);
    }
  };

  const { mutate: deletePlugin, isPending: isDeleting } = usePluginsServiceDeletePlugin({
    onSuccess: () => {
      // The server drops the plugin's bundle from the served asset set, so the running frontend is
      // holding modules that no longer exist — a reload is the only way back to a consistent app.
      setTimeout(() => window.location.reload(), 5000);
      setPluginToDelete(null);
      toast.success({ title: t('success.delete.title'), description: t('success.delete.description') });
    },
    onError: () => {
      toast.error({ title: t('error.delete.title'), description: t('error.delete.description') });
    },
  });

  const openVersionManagement = async (plugin: VersionPlugin) => {
    const request = ++versionRequest.current;
    setVersionPlugin(plugin);
    setVersions([]);
    setSelectedVersion(null);
    setPermissionApproved(false);
    setMajorApproved(false);
    const installed = installedNpmPlugins.get(plugin.name);
    setRequestedSpec(installed?.requestedSpec ?? plugin.version);
    setUpdateOverride(installed?.updateOverride ?? 'inherit');
    setIsLoadingVersions(true);
    try {
      const response = await fetch(
        `${getBaseUrl()}/api/plugins/installed/${encodeURIComponent(plugin.name)}/versions`,
        {
          credentials: 'include',
        },
      );
      if (!response.ok) throw new Error();
      const candidates = (await response.json()) as VersionCandidate[];
      if (versionRequest.current === request) setVersions(candidates);
    } catch {
      if (versionRequest.current === request)
        toast.error({ title: t('error.versions.title'), description: t('error.versions.description') });
    } finally {
      if (versionRequest.current === request) setIsLoadingVersions(false);
    }
  };

  const replaceVersion = async () => {
    if (!versionPlugin || !selectedVersion) return;
    setIsReplacing(true);
    try {
      const response = await fetch(
        `${getBaseUrl()}/api/plugins/installed/${encodeURIComponent(versionPlugin.name)}/versions/${selectedVersion.version}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            approvedPermissionAdditions: selectedVersion.permissionAdditions,
            approvedMajorVersion: majorApproved,
          }),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      toast.success({ title: t('success.replace.title'), description: t('success.replace.description') });
      setTimeout(() => window.location.reload(), 5000);
      setVersionPlugin(null);
    } catch {
      toast.error({ title: t('error.replace.title'), description: t('error.replace.description') });
    } finally {
      setIsReplacing(false);
    }
  };

  const saveVersionPolicy = async () => {
    if (!versionPlugin) return;
    try {
      const response = await fetch(
        `${getBaseUrl()}/api/plugins/installed/${encodeURIComponent(versionPlugin.name)}/update-policy`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestedSpec, updateOverride }),
        },
      );
      if (!response.ok) throw new Error();
      const installed = (await response.json()) as InstalledNpmPlugin;
      setInstalledNpmPlugins((current) => new Map(current).set(installed.name, installed));
      toast.success({ title: t('versionManagement.policySaved') });
    } catch {
      toast.error({ title: t('versionManagement.policyError') });
    }
  };

  const aside = (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">{t('aside.title')}</h3>
      <p className="text-xs text-muted">{t('aside.description')}</p>
      <a href={DOCS_URL} target="_blank" rel="noreferrer" data-cy="plugins-list-docs-link">
        <Button variant="secondary" size="sm">
          <BookOpen size={16} />
          {t('docsButton')}
        </Button>
      </a>
    </div>
  );

  return (
    <SettingsSection title={t('title')} description={t('description')} aside={aside}>
      <div data-cy="plugins-list-card" className="flex flex-col gap-4">
        <div className="flex justify-end">
          <Dropdown>
            <DropdownTrigger
              className={`${buttonVariants({ variant: 'primary', size: 'sm' })} !inline-flex items-center gap-2`}
              data-cy="plugins-list-install-plugin-button"
            >
              <Upload size={16} />
              {t('installPlugin')}
              <ChevronDown size={16} />
            </DropdownTrigger>
            <DropdownPopover>
              <DropdownMenu aria-label={t('installPlugin')}>
                <DropdownItem id="marketplace" onPress={() => setIsMarketplaceOpen(true)}>
                  <Store size={16} />
                  {t('marketplace.open')}
                </DropdownItem>
                <DropdownItem id="upload" onPress={() => setIsUploadOpen(true)}>
                  <Upload size={16} />
                  {t('uploadButton')}
                </DropdownItem>
              </DropdownMenu>
            </DropdownPopover>
          </Dropdown>
        </div>

        <Table data-cy="plugins-list-table">
          <TableScrollContainer>
            <TableContent aria-label={t('title')}>
              <TableHeader>
                <TableColumn isRowHeader>{t('columns.name')}</TableColumn>
                <TableColumn>{t('columns.version')}</TableColumn>
                <TableColumn className="hidden sm:table-cell">{t('columns.directory')}</TableColumn>
                <TableColumn className="hidden sm:table-cell">{t('columns.permissions')}</TableColumn>
                <TableColumn className="hidden md:table-cell">{t('columns.source')}</TableColumn>
                <TableColumn>{t('columns.status')}</TableColumn>
                <TableColumn width="0" className="text-right">
                  {t('columns.actions')}
                </TableColumn>
              </TableHeader>
              <TableBody items={plugins ?? []} renderEmptyState={() => <EmptyState />}>
                {(plugin) => (
                  <TableRow key={plugin.name} id={plugin.name}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{plugin.name}</span>
                        <PluginClassificationBadge
                          classification={installedNpmPlugins.get(plugin.name)?.classification ?? 'community'}
                        />
                      </div>
                      {installedNpmPlugins.get(plugin.name)?.registryUrl ? (
                        <p className="mt-1 text-xs text-muted md:hidden">
                          {installedNpmPlugins.get(plugin.name)?.registryUrl}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Chip variant="soft" color="accent">
                        {plugin.version}
                      </Chip>
                      {installedNpmPlugins.get(plugin.name)?.updateCheck?.state === 'available' ? (
                        <Chip variant="soft" color="warning">
                          {t('updatePolicy.available')}
                        </Chip>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{plugin.pluginDirectory || '-'}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {plugin.permissions && plugin.permissions.length > 0 ? (
                        <div className="flex flex-wrap gap-1" data-cy={`plugins-list-permissions-${plugin.id}`}>
                          {plugin.permissions.map((permission) => (
                            <Chip key={permission} variant="soft" color="warning">
                              {permission}
                            </Chip>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted">{t('noPermissions')}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted">
                      {installedNpmPlugins.get(plugin.name)?.registryUrl ?? '-'}
                    </TableCell>
                    <TableCell>
                      {plugin.status === 'error' ? (
                        <Tooltip>
                          <Chip variant="soft" color="danger" data-cy={`plugins-list-status-${plugin.id}`}>
                            <span className="inline-flex items-center gap-1">
                              <AlertTriangle size={14} />
                              {t('status.error')}
                            </span>
                          </Chip>
                          <TooltipContent>{t('status.errorTooltip', { message: plugin.error ?? '' })}</TooltipContent>
                        </Tooltip>
                      ) : plugin.status === 'loaded' ? (
                        <Chip variant="soft" color="success" data-cy={`plugins-list-status-${plugin.id}`}>
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 size={14} />
                            {t('status.loaded')}
                          </span>
                        </Chip>
                      ) : (
                        <Chip variant="soft" color="default" data-cy={`plugins-list-status-${plugin.id}`}>
                          {t('status.unknown')}
                        </Chip>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        {npmPluginNames.has(plugin.name) && installedNpmPlugins.get(plugin.name) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onPress={() =>
                              void openMarketplacePlugin({
                                name: plugin.name,
                                version: installedNpmPlugins.get(plugin.name)?.version ?? plugin.version,
                                displayName: plugin.name,
                                description: null,
                                permissions: installedNpmPlugins.get(plugin.name)?.permissions ?? [],
                                hostRange: null,
                                sdkCompatibility: { backend: null, frontend: null },
                                repository: null,
                                homepage: null,
                                license: null,
                                publisher: installedNpmPlugins.get(plugin.name)?.publisher ?? null,
                                deprecated: false,
                                registry: {
                                  id: installedNpmPlugins.get(plugin.name)?.registryId ?? 'npm',
                                  name: installedNpmPlugins.get(plugin.name)?.registryUrl ?? 'npm',
                                  url: installedNpmPlugins.get(plugin.name)?.registryUrl ?? '',
                                },
                                classification: installedNpmPlugins.get(plugin.name)?.classification ?? 'community',
                                classificationReason: installedNpmPlugins.get(plugin.name)?.classificationReason ?? '',
                                installable: true,
                                incompatibilityReason: null,
                                integrity: installedNpmPlugins.get(plugin.name)?.integrity ?? null,
                                provenance: installedNpmPlugins.get(plugin.name)
                                  ? `${installedNpmPlugins.get(plugin.name)?.registryUrl}${
                                      installedNpmPlugins.get(plugin.name)?.publisher
                                        ? ` (${installedNpmPlugins.get(plugin.name)?.publisher})`
                                        : ''
                                    }`
                                  : null,
                              })
                            }
                          >
                            {t('marketplace.details')}
                          </Button>
                        ) : null}
                        {npmPluginNames.has(plugin.name) ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onPress={() => void openVersionManagement({ name: plugin.name, version: plugin.version })}
                            data-cy={`plugins-list-manage-version-button-${plugin.id}`}
                          >
                            {t('manageVersion')}
                          </Button>
                        ) : null}
                        <Tooltip>
                          <Button
                            variant="danger-soft"
                            size="sm"
                            isIconOnly
                            aria-label={t('deleteTooltip')}
                            onPress={() => setPluginToDelete(plugin.id)}
                            data-cy={`plugins-list-delete-plugin-button-${plugin.id}`}
                          >
                            <Trash2 size={16} />
                          </Button>
                          <TooltipContent>{t('deleteTooltip')}</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </TableContent>
          </TableScrollContainer>
        </Table>

        <StandardModal isOpen={isMarketplaceOpen} onOpenChange={setIsMarketplaceOpen} size="lg">
          {() => (
            <>
              <ModalHeader>
                <ModalHeading>{t('marketplace.title')}</ModalHeading>
              </ModalHeader>
              <ModalBody>
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-muted">{t('marketplace.description')}</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <TextField
                      value={marketplaceQuery}
                      onChange={(value) => {
                        marketplaceSearchRequest.current++;
                        setMarketplaceQuery(value);
                      }}
                      className="w-full"
                    >
                      <Input placeholder={t('marketplace.searchPlaceholder')} aria-label={t('marketplace.search')} />
                    </TextField>
                    <select
                      aria-label={t('marketplace.registry')}
                      value={selectedRegistryId}
                      onChange={(event) => {
                        marketplaceSearchRequest.current++;
                        setSelectedRegistryId(event.target.value);
                      }}
                      className="h-10 rounded-medium border border-divider bg-content1 px-3 text-sm"
                    >
                      <option value="">{t('marketplace.allRegistries')}</option>
                      <option value="npm">npm</option>
                      {registries.map((registry) => (
                        <option key={registry.id} value={registry.id}>
                          {registry.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {isLoadingMarketplace ? (
                    <p role="status" className="text-sm text-muted">
                      {t('marketplace.loading')}
                    </p>
                  ) : null}
                  {(['official', 'community'] as const).map((classification) => {
                    const pluginsForClassification = marketplacePlugins.filter(
                      (plugin) => plugin.classification === classification,
                    );
                    if (pluginsForClassification.length === 0) return null;
                    return (
                      <div key={classification} className="flex flex-col gap-3">
                        <h4 className="font-medium text-foreground">{t(`marketplace.${classification}`)}</h4>
                        <div className="grid gap-3 md:grid-cols-2">
                          {pluginsForClassification.map((plugin) => (
                            <article
                              key={`${plugin.registry.id}:${plugin.name}`}
                              className="flex flex-col gap-3 rounded-medium border border-divider p-4"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <h4 className="font-medium text-foreground">{plugin.displayName ?? plugin.name}</h4>
                                  <p className="text-xs text-muted">{plugin.name}</p>
                                </div>
                                <PluginClassificationBadge classification={plugin.classification} />
                              </div>
                              {plugin.description ? <p className="text-sm text-muted">{plugin.description}</p> : null}
                              <p className="text-xs text-muted">
                                {t('marketplace.version', { version: plugin.version ?? '-' })}
                              </p>
                              {plugin.incompatibilityReason ? (
                                <p className="text-sm text-danger">{plugin.incompatibilityReason}</p>
                              ) : null}
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-muted">
                                  {plugin.registry.name} · {plugin.publisher ?? '-'}
                                </span>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onPress={() => void openMarketplacePlugin(plugin, true)}
                                >
                                  {npmPluginNames.has(plugin.name)
                                    ? t('marketplace.installed')
                                    : t('marketplace.details')}
                                </Button>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {!isLoadingMarketplace && marketplacePlugins.length === 0 ? (
                    <p role="status" className="text-sm text-muted">
                      {t('marketplace.noResults')}
                    </p>
                  ) : null}
                  <details className="border-t border-divider pt-4">
                    <summary className="cursor-pointer font-medium text-foreground">
                      {t('marketplace.registryManagement')}
                    </summary>
                    <div className="mt-3 flex flex-col gap-3">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <TextField value={registryName} onChange={setRegistryName}>
                          <Input
                            placeholder={t('marketplace.registryName')}
                            aria-label={t('marketplace.registryName')}
                          />
                        </TextField>
                        <TextField value={registryUrl} onChange={setRegistryUrl}>
                          <Input placeholder={t('marketplace.registryUrl')} aria-label={t('marketplace.registryUrl')} />
                        </TextField>
                        <TextField value={registryToken} onChange={setRegistryToken}>
                          <Input
                            type="password"
                            placeholder={t('marketplace.registryToken')}
                            aria-label={t('marketplace.registryToken')}
                          />
                        </TextField>
                      </div>
                      <div>
                        <Button variant="secondary" onPress={() => void addRegistry()} isPending={isSavingRegistry}>
                          {t('marketplace.addRegistry')}
                        </Button>
                      </div>
                      {registries.map((registry) => (
                        <div
                          key={registry.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-medium border border-divider p-3 text-sm"
                        >
                          <span>
                            {registry.name} · {registry.url} ·{' '}
                            {registry.tokenConfigured ? t('marketplace.tokenConfigured') : t('marketplace.noToken')}
                          </span>
                          <span className="flex gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onPress={() => void testRegistry(registry.id)}
                              isPending={testingRegistryId === registry.id}
                            >
                              {t('marketplace.testRegistry')}
                            </Button>
                            <Button variant="danger-soft" size="sm" onPress={() => void removeRegistry(registry.id)}>
                              {t('marketplace.removeRegistry')}
                            </Button>
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              </ModalBody>
            </>
          )}
        </StandardModal>
      </div>

      <StandardDrawer
        isOpen={marketplacePlugin !== null}
        onOpenChange={(open) => !open && setMarketplacePlugin(null)}
        contentProps={{ placement: 'right' }}
      >
        <DrawerHeader>
          <h2 className="text-lg font-semibold">
            {t('marketplace.detailTitle', {
              pluginName: marketplacePlugin?.displayName ?? marketplacePlugin?.name ?? '',
            })}
          </h2>
        </DrawerHeader>
        <DrawerBody>
          {marketplacePlugin ? (
            <div className="flex flex-col gap-3">
              <PluginClassificationBadge classification={marketplacePlugin.classification} />
              {marketplacePlugin.description ? <p>{marketplacePlugin.description}</p> : null}
              <p>{t('marketplace.source', { registry: marketplacePlugin.registry.url })}</p>
              <p>{t('marketplace.version', { version: marketplacePlugin.version ?? '-' })}</p>
              <p>{t('marketplace.publisher', { publisher: marketplacePlugin.publisher ?? '-' })}</p>
              <p>{t('marketplace.hostCompatibility', { range: marketplacePlugin.hostRange ?? '-' })}</p>
              <p>
                {t('marketplace.sdkCompatibility', {
                  backend: marketplacePlugin.sdkCompatibility?.backend ?? '-',
                  frontend: marketplacePlugin.sdkCompatibility?.frontend ?? '-',
                })}
              </p>
              <p>{t('marketplace.license', { license: marketplacePlugin.license ?? '-' })}</p>
              {marketplacePlugin.repository ? (
                <a
                  className="text-primary underline"
                  href={marketplacePlugin.repository}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('marketplace.repository')}
                </a>
              ) : null}
              {marketplacePlugin.homepage ? (
                <a
                  className="text-primary underline"
                  href={marketplacePlugin.homepage}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('marketplace.homepage')}
                </a>
              ) : null}
              <p>{t('marketplace.integrity', { integrity: marketplacePlugin.integrity ?? '-' })}</p>
              {marketplacePlugin.provenance ? (
                <p>{t('marketplace.provenance', { provenance: marketplacePlugin.provenance })}</p>
              ) : null}
              {marketplacePlugin.deprecated ? <p className="text-warning">{t('marketplace.deprecated')}</p> : null}
              <p>
                {t('marketplace.permissions', {
                  permissions: marketplacePlugin.permissions.join(', ') || t('noPermissions'),
                })}
              </p>
              {marketplacePlugin.incompatibilityReason ? (
                <p className="text-danger">{marketplacePlugin.incompatibilityReason}</p>
              ) : null}
              <p className="text-warning text-sm">{t('marketplace.restartWarning')}</p>
            </div>
          ) : null}
        </DrawerBody>
        <DrawerFooter>
          <Button variant="ghost" onPress={() => setMarketplacePlugin(null)}>
            {t('marketplace.cancel')}
          </Button>
          <Button
            variant="primary"
            isDisabled={!marketplacePlugin?.installable || npmPluginNames.has(marketplacePlugin?.name ?? '')}
            onPress={() => {
              if (marketplacePlugin) {
                setInstallApproved(false);
                setPluginToInstall(marketplacePlugin);
                setMarketplacePlugin(null);
              }
            }}
          >
            {npmPluginNames.has(marketplacePlugin?.name ?? '') ? t('marketplace.installed') : t('marketplace.install')}
          </Button>
        </DrawerFooter>
      </StandardDrawer>

      <StandardDrawer
        isOpen={pluginToInstall !== null}
        onOpenChange={(open) => {
          if (!open && !isInstalling) {
            setPluginToInstall(null);
            setInstallApproved(false);
          }
        }}
        contentProps={{ placement: 'right' }}
      >
        <DrawerHeader>
          <h2 className="text-lg font-semibold">
            {t('marketplace.installTitle', {
              pluginName: pluginToInstall?.displayName ?? pluginToInstall?.name ?? '',
            })}
          </h2>
        </DrawerHeader>
        <DrawerBody>
          {pluginToInstall ? (
            <div className="flex flex-col gap-3">
              <PluginClassificationBadge classification={pluginToInstall.classification} />
              <p>{t('marketplace.installDescription')}</p>
              <p>{t('marketplace.source', { registry: pluginToInstall.registry.url })}</p>
              <p>{t('marketplace.version', { version: pluginToInstall.version ?? '-' })}</p>
              <p>
                {t('marketplace.permissions', {
                  permissions: pluginToInstall.permissions.join(', ') || t('noPermissions'),
                })}
              </p>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={installApproved}
                  onChange={(event) => setInstallApproved(event.target.checked)}
                />
                {t('marketplace.installApproval')}
              </label>
              <p className="text-warning text-sm">{t('marketplace.restartWarning')}</p>
            </div>
          ) : null}
        </DrawerBody>
        <DrawerFooter>
          <Button
            variant="ghost"
            onPress={() => {
              setPluginToInstall(null);
              setInstallApproved(false);
            }}
            isDisabled={isInstalling}
          >
            {t('marketplace.cancel')}
          </Button>
          <Button
            variant="primary"
            onPress={() => void installMarketplacePlugin()}
            isPending={isInstalling}
            isDisabled={!installApproved}
          >
            {t('marketplace.confirmInstall')}
          </Button>
        </DrawerFooter>
      </StandardDrawer>

      <StandardModal
        isOpen={pluginToDelete !== null}
        onOpenChange={(open) => !open && setPluginToDelete(null)}
        data-cy="plugins-list-delete-confirmation-modal"
        size="sm"
      >
        {({ close }) => (
          <>
            <ModalHeader>
              <ModalHeading>{t('deleteConfirmation.title')}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              {t('deleteConfirmation.message', {
                pluginName: plugins?.find((plugin) => plugin.id === pluginToDelete)?.name ?? '',
              })}
            </ModalBody>
            <ModalFooter>
              <Button
                variant="ghost"
                onPress={close}
                isDisabled={isDeleting}
                data-cy="plugins-list-delete-confirmation-cancel-button"
              >
                {t('deleteConfirmation.cancel')}
              </Button>
              <Button
                variant="danger"
                onPress={() => pluginToDelete && deletePlugin({ pluginId: pluginToDelete })}
                isPending={isDeleting}
                data-cy="plugins-list-delete-confirmation-delete-button"
              >
                {t('deleteConfirmation.delete')}
              </Button>
            </ModalFooter>
          </>
        )}
      </StandardModal>

      <StandardModal
        isOpen={versionPlugin !== null}
        onOpenChange={(open) => !open && !isReplacing && setVersionPlugin(null)}
        data-cy="plugins-list-version-management-modal"
        size="lg"
      >
        {({ close }) => (
          <>
            <ModalHeader>
              <ModalHeading>{t('versionManagement.title', { pluginName: versionPlugin?.name ?? '' })}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <p>{t('versionManagement.current', { version: versionPlugin?.version ?? '' })}</p>
              <div className="flex flex-col gap-2 rounded-medium border border-divider p-3">
                <TextField value={requestedSpec} onChange={setRequestedSpec}>
                  <Input aria-label={t('versionManagement.spec')} placeholder="^1.2.0 or latest" />
                </TextField>
                <Select
                  value={updateOverride}
                  onChange={(value) => setUpdateOverride(value as InstalledNpmPlugin['updateOverride'])}
                  items={['inherit', 'off', 'patch', 'minor', 'follow'].map((value) => ({
                    key: value,
                    label: t(`versionManagement.overrides.${value}`),
                  }))}
                  aria-label={t('versionManagement.autoUpdate')}
                />
                <Button variant="secondary" size="sm" onPress={() => void saveVersionPolicy()}>
                  {t('versionManagement.savePolicy')}
                </Button>
              </div>
              {isLoadingVersions ? <p>{t('versionManagement.loading')}</p> : null}
              <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                {versions.map((candidate) => (
                  <Button
                    key={candidate.version}
                    variant={selectedVersion?.version === candidate.version ? 'primary' : 'secondary'}
                    className="justify-between"
                    isDisabled={!candidate.compatible || candidate.direction === 'current'}
                    onPress={() => {
                      setSelectedVersion(candidate);
                      setPermissionApproved(false);
                      setMajorApproved(false);
                    }}
                    data-cy={`plugins-list-version-${candidate.version}`}
                  >
                    <span>{candidate.version}</span>
                    <span>{t(`versionManagement.direction.${candidate.direction}`)}</span>
                  </Button>
                ))}
              </div>
              {selectedVersion ? (
                <div className="flex flex-col gap-2 rounded-medium border border-divider p-3">
                  <p>{t('versionManagement.selected', { version: selectedVersion.version })}</p>
                  {selectedVersion.publishedAt ? (
                    <p>
                      {t('versionManagement.published', {
                        date: new Date(selectedVersion.publishedAt).toLocaleDateString(),
                      })}
                    </p>
                  ) : null}
                  {selectedVersion.permissionAdditions.length > 0 ? (
                    <label className="flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={permissionApproved}
                        onChange={(event) => setPermissionApproved(event.target.checked)}
                      />
                      {t('versionManagement.permissionApproval', {
                        permissions: selectedVersion.permissionAdditions.join(', '),
                      })}
                    </label>
                  ) : null}
                  {selectedVersion.semverImpact === 'major' ? (
                    <LabeledSwitch isSelected={majorApproved} onChange={setMajorApproved}>
                      {t('versionManagement.majorApproval')}
                    </LabeledSwitch>
                  ) : null}
                  {selectedVersion.deprecated ? (
                    <p className="text-warning">
                      {t('versionManagement.deprecated', { notice: selectedVersion.deprecated })}
                    </p>
                  ) : null}
                  <p>{t('versionManagement.integrity', { integrity: selectedVersion.integrity ?? '-' })}</p>
                  {selectedVersion.repository ? (
                    <a className="text-accent" href={selectedVersion.repository} target="_blank" rel="noreferrer">
                      {t('versionManagement.repository')}
                    </a>
                  ) : null}
                  {selectedVersion.permissionRemovals.length > 0 ? (
                    <p>
                      {t('versionManagement.permissionRemovals', {
                        permissions: selectedVersion.permissionRemovals.join(', '),
                      })}
                    </p>
                  ) : null}
                  {selectedVersion.direction === 'older' ? (
                    <p className="text-warning">{t('versionManagement.downgradeWarning')}</p>
                  ) : null}
                </div>
              ) : null}
              {versions
                .filter((candidate) => !candidate.compatible)
                .map((candidate) => (
                  <p key={candidate.version} className="text-danger text-sm">
                    {candidate.version}: {candidate.reason}
                  </p>
                ))}
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={close} isDisabled={isReplacing}>
                {t('versionManagement.cancel')}
              </Button>
              <Button
                variant={selectedVersion?.direction === 'older' ? 'danger' : 'primary'}
                onPress={() => void replaceVersion()}
                isPending={isReplacing}
                isDisabled={
                  !selectedVersion ||
                  (selectedVersion.permissionAdditions.length > 0 && !permissionApproved) ||
                  (selectedVersion.semverImpact === 'major' && !majorApproved)
                }
                data-cy="plugins-list-replace-version-button"
              >
                {selectedVersion?.direction === 'older'
                  ? t('versionManagement.downgrade')
                  : t('versionManagement.update')}
              </Button>
            </ModalFooter>
          </>
        )}
      </StandardModal>

      <UploadPluginModal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} />
    </SettingsSection>
  );
}

export default PluginsSection;
