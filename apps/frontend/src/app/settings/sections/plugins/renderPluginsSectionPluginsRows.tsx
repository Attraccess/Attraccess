import { Chip, TableCell, TableRow, Tooltip, TooltipContent } from '@heroui/react';
import { AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import { Button } from '../../../../components/button';
import { PluginClassificationBadge } from './PluginClassificationBadge';
import { usePluginsSectionState } from './usePluginsSectionState';
type Model = ReturnType<typeof usePluginsSectionState>;
type Props = Pick<
  Model,
  | 'installedNpmPlugins'
  | 't'
  | 'setFailedPlugin'
  | 'npmPluginNames'
  | 'openMarketplacePlugin'
  | 'openVersionManagement'
  | 'setApprovedRemovalPlan'
  | 'setRemoveFailure'
  | 'setPluginToDelete'
>;
export function renderPluginsSectionPluginsRows(
  plugin: NonNullable<Model['plugins']>[number],
  {
    installedNpmPlugins,
    t,
    setFailedPlugin,
    npmPluginNames,
    openMarketplacePlugin,
    openVersionManagement,
    setApprovedRemovalPlan,
    setRemoveFailure,
    setPluginToDelete,
  }: Props,
) {
  return (
    <TableRow key={plugin.name} id={plugin.name}>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <span>{plugin.name}</span>
          <PluginClassificationBadge
            classification={installedNpmPlugins.get(plugin.name)?.classification ?? 'community'}
          />
        </div>
        {installedNpmPlugins.get(plugin.name)?.registryUrl ? (
          <p className="mt-1 text-xs text-muted md:hidden">{installedNpmPlugins.get(plugin.name)?.registryUrl}</p>
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
          <button
            type="button"
            className="rounded-medium outline-none focus-visible:ring-2 focus-visible:ring-focus"
            onClick={() => setFailedPlugin({ id: plugin.id, name: plugin.name, error: plugin.error ?? '' })}
            aria-label={t('status.viewError', { pluginName: plugin.name })}
            data-cy={`plugins-list-status-${plugin.id}`}
          >
            <Tooltip>
              <Chip variant="soft" color="danger">
                <span className="inline-flex items-center gap-1">
                  <AlertTriangle size={14} />
                  {t('status.error')}
                </span>
              </Chip>
              <TooltipContent>{t('status.errorTooltip')}</TooltipContent>
            </Tooltip>
          </button>
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
                  provenance: null,
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
              onPress={() => {
                setApprovedRemovalPlan(null);
                setRemoveFailure(null);
                setPluginToDelete(plugin.id);
              }}
              data-cy={`plugins-list-delete-plugin-button-${plugin.id}`}
            >
              <Trash2 size={16} />
            </Button>
            <TooltipContent>{t('deleteTooltip')}</TooltipContent>
          </Tooltip>
        </div>
      </TableCell>
    </TableRow>
  );
}
