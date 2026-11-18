import { Button } from '@attraccess/plugins-frontend-ui';
import type { InstalledNpmPluginDto, LoadedPluginManifest } from '@attraccess/react-query-client';
import { Chip, TableCell, TableRow, Tooltip, TooltipContent, TooltipTrigger } from '@heroui/react';
import { AlertTriangle, CheckCircle2, KeyRound, Trash2 } from 'lucide-react';
import { PluginClassificationBadge } from '../PluginClassificationBadge';
import type { FailedPlugin, MarketplaceDetailRequest, VersionPlugin } from '../types';
import { usePluginsTranslations } from '../usePluginsTranslations';

interface Props {
  plugin: LoadedPluginManifest;
  /** The npm record of this plugin, when it was installed from a registry. */
  installed: InstalledNpmPluginDto | undefined;
  onShowError: (plugin: FailedPlugin) => void;
  onShowDetails: (request: MarketplaceDetailRequest) => void;
  onManageVersion: (plugin: VersionPlugin) => void;
  onDelete: (pluginId: string) => void;
}

export function PluginRow({ plugin, installed, onShowError, onShowDetails, onManageVersion, onDelete }: Props) {
  const { t } = usePluginsTranslations();
  return (
    // The id is per plugin directory: a refused 1.x copy and a valid 2.0 copy of the same name are both listed, and
    // the table drops rows with a duplicate key.
    <TableRow key={plugin.id} id={plugin.id}>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <span>{plugin.name}</span>
          <PluginClassificationBadge classification={installed?.classification ?? 'community'} />
        </div>
        {plugin.status === 'license_missing' ? (
          <p className="mt-1 text-xs text-muted" data-cy={`plugins-list-license-missing-${plugin.id}`}>
            {plugin.missingLicenseModules?.length
              ? t('status.licenseMissingModules', {
                  count: plugin.missingLicenseModules.length,
                  modules: plugin.missingLicenseModules.join(', '),
                })
              : t('status.licenseMissingRequired')}
          </p>
        ) : null}
        {installed?.registryUrl ? <p className="mt-1 text-xs text-muted md:hidden">{installed.registryUrl}</p> : null}
      </TableCell>
      <TableCell>
        <Chip variant="soft" color="accent">
          {plugin.version}
        </Chip>
        {installed?.updateCheck?.state === 'available' ? (
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
      <TableCell className="hidden md:table-cell text-xs text-muted">{installed?.registryUrl ?? '-'}</TableCell>
      <TableCell>
        {plugin.status === 'error' ? (
          <button
            type="button"
            className="rounded-medium outline-none focus-visible:ring-2 focus-visible:ring-focus"
            onClick={() =>
              onShowError({
                id: plugin.id,
                name: plugin.name,
                error: plugin.error ?? '',
                refused: plugin.refused === true,
              })
            }
            aria-label={t('status.viewError', { pluginName: plugin.name })}
            data-cy={`plugins-list-status-${plugin.id}`}
          >
            <Tooltip>
              <Chip variant="soft" color="danger">
                <span className="inline-flex items-center gap-1">
                  <AlertTriangle size={14} />
                  {plugin.refused ? t('status.refused') : t('status.error')}
                </span>
              </Chip>
              <TooltipContent>{t('status.errorTooltip')}</TooltipContent>
            </Tooltip>
          </button>
        ) : plugin.status === 'license_missing' ? (
          // An expected state, not a failure: the plugin needs a license the installation does not have.
          <Tooltip>
            <TooltipTrigger tabIndex={0}>
              <Chip variant="soft" color="warning" data-cy={`plugins-list-status-${plugin.id}`}>
                <span className="inline-flex items-center gap-1">
                  <KeyRound size={14} />
                  {t('status.licenseMissing')}
                </span>
              </Chip>
            </TooltipTrigger>
            <TooltipContent>{t('status.licenseMissingTooltip')}</TooltipContent>
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
          {installed ? (
            <Button
              variant="ghost"
              size="sm"
              onPress={() => onShowDetails({ name: plugin.name, registryId: installed.registryId ?? 'npm' })}
            >
              {t('marketplace.details')}
            </Button>
          ) : null}
          {installed ? (
            <Button
              variant="secondary"
              size="sm"
              onPress={() => onManageVersion({ name: plugin.name, version: plugin.version })}
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
              onPress={() => onDelete(plugin.id)}
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
