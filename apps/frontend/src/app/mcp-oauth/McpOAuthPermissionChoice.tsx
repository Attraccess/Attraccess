import { useMemo } from 'react';
import {
  Accordion,
  AccordionBody,
  AccordionHeading,
  AccordionIndicator,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import type { McpOAuthConsentPermissionDto, McpOAuthConsentToolDto } from '@attraccess/react-query-client';
import { mcpToolAllowed } from '@attraccess/shared';
import { PermissionPicker } from '../../components/permissionPicker';
import { useRbacCatalogTranslations } from '../../hooks/useRbacCatalogTranslations';
import en from './en.json';
import de from './de.json';

interface McpOAuthPermissionChoiceProps {
  /** What the user may hand out: their own current permissions. */
  availablePermissions: McpOAuthConsentPermissionDto[];
  /** Every tool the full set could unlock; the selection narrows it locally. */
  tools: McpOAuthConsentToolDto[];
  selectedKeys: ReadonlySet<string>;
  onChange: (keys: Set<string>) => void;
  /** The client named no permissions and asks for everything the user can do. */
  requestedAll: boolean;
  isDisabled?: boolean;
}

/** The consent page's permission choice, as on API token creation, with a live list of the tools it enables. */
export function McpOAuthPermissionChoice({
  availablePermissions,
  tools,
  selectedKeys,
  onChange,
  requestedAll,
  isDisabled,
}: McpOAuthPermissionChoiceProps) {
  const { t } = useTranslations({ en, de });
  const { permissionLabel, permissionDescription, permissionCategory } = useRbacCatalogTranslations();
  // The picker lists catalog permissions; everything offered here is one the user holds.
  const pickable = useMemo(
    () => availablePermissions.map((permission) => ({ ...permission, available: true })),
    [availablePermissions],
  );
  const enabledTools = useMemo(
    () =>
      // Nothing selected means nothing can be allowed, so the tools with no requirement do not count either.
      selectedKeys.size === 0
        ? []
        : tools.filter((tool) =>
            mcpToolAllowed({ all: tool.requiredAll, any: tool.requiredAny }, selectedKeys as ReadonlySet<string>),
          ),
    [tools, selectedKeys],
  );

  return (
    <section aria-labelledby="mcp-oauth-permissions" className="flex flex-col gap-3">
      <h4 id="mcp-oauth-permissions" className="text-base font-semibold">
        {t('permissions.title')}
      </h4>
      <p className="text-sm text-muted">{t('permissions.hint')}</p>
      {requestedAll && (
        <p className="text-sm text-muted">{t('permissions.all', { count: availablePermissions.length })}</p>
      )}
      {availablePermissions.length === 0 ? (
        <p className="text-sm text-muted">{t('permissions.none')}</p>
      ) : (
        <PermissionPicker
          permissions={pickable}
          selectedKeys={selectedKeys as Set<string>}
          onChange={(keys) => onChange(new Set([...keys].map(String)))}
          label={t('permissions.label')}
          placeholder={t('permissions.placeholder')}
          searchPlaceholder={t('permissions.searchPlaceholder')}
          emptyMessage={t('permissions.empty')}
          permissionLabel={permissionLabel}
          permissionDescription={permissionDescription}
          permissionCategory={permissionCategory}
          dataCy="mcp-oauth-permission-picker"
          isDisabled={isDisabled}
          presentation="drawer"
          drawerTitle={t('permissions.picker.title')}
          drawerDescription={t('permissions.picker.description')}
          drawerApplyLabel={t('permissions.picker.apply')}
          drawerCancelLabel={t('permissions.picker.cancel')}
          drawerSelectedCount={(selected, total) => t('permissions.picker.selectedCount', { selected, total })}
          drawerPreviewLabel={t('permissions.picker.previewLabel')}
          drawerEmptyPreview={t('permissions.picker.emptyPreview')}
          drawerEditLabel={t('permissions.picker.edit')}
          drawerSelectCategoryLabel={t('permissions.picker.selectCategory')}
          drawerClearCategoryLabel={t('permissions.picker.clearCategory')}
        />
      )}

      <Accordion variant="default" className="w-full" data-cy="mcp-oauth-tools">
        <AccordionItem id="tools" aria-label={t('tools.title', { count: enabledTools.length })}>
          <AccordionHeading>
            <AccordionTrigger>
              <span data-cy="mcp-oauth-tools-count">{t('tools.title', { count: enabledTools.length })}</span>
              <AccordionIndicator />
            </AccordionTrigger>
          </AccordionHeading>
          <AccordionPanel>
            <AccordionBody className="flex flex-col gap-2">
              <p className="text-sm text-muted">{t('tools.description')}</p>
              {enabledTools.length === 0 ? (
                <p className="text-sm text-muted">{t('tools.none')}</p>
              ) : (
                <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto text-sm" data-cy="mcp-oauth-tools-list">
                  {enabledTools.map((tool) => (
                    <li key={tool.name}>
                      <span className="font-mono">{tool.name}</span>
                      <span className="text-muted"> {tool.summary}</span>
                    </li>
                  ))}
                </ul>
              )}
            </AccordionBody>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
