// NodeCatalogPanel: responsive container hosting CatalogContent in sidebar and mobile overlay
// FEATURE: Node catalog redesign — top-level panel
import { forwardRef, useCallback, useImperativeHandle } from 'react';
import { DrawerBody, DrawerHeader, useOverlayState, Button, Spinner } from '@heroui/react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { TFunction, useTranslations } from '@attraccess/plugins-frontend-ui';
import { StandardDrawer } from '../../../../../components/standardDrawer';
import { CatalogContent } from './catalogContent';
import { useNodeCatalog } from './useNodeCatalog';
import { getDomainDef, getPluginDomainLabel } from './domains';
import de from './de.json';
import en from './en.json';

export interface NodeCatalogHandle {
  open: () => void;
}

interface Props {
  resourceId: number;
  onSelect: (nodeType: string) => void;
  tNodeTranslations: TFunction;
}

export const NodeCatalogPanel = forwardRef<NodeCatalogHandle, Props>(function NodeCatalogPanel(
  { resourceId, onSelect, tNodeTranslations },
  ref,
) {
  const { t } = useTranslations({ de, en });
  const { groups, isLoading, isError, collapsed, setCollapsed, isDomainExpanded, setDomainExpanded } = useNodeCatalog({
    resourceId,
  });
  const { isOpen, setOpen } = useOverlayState();

  const loadingSpinner = isLoading ? (
    <div className="flex items-center justify-center h-full" role="status" aria-label={t('loading')}>
      <Spinner size="sm" />
    </div>
  ) : isError ? (
    <div className="flex items-center justify-center h-full p-2 text-center text-sm text-danger" role="alert">
      {t('error')}
    </div>
  ) : null;

  const openCatalog = useCallback(() => setOpen(true), [setOpen]);
  const closeCatalog = useCallback(() => setOpen(false), [setOpen]);

  useImperativeHandle(ref, () => ({ open: openCatalog }), [openCatalog]);

  const handleSelectMobile = useCallback(
    (nodeType: string) => {
      onSelect(nodeType);
      closeCatalog();
    },
    [onSelect, closeCatalog],
  );

  return (
    <>
      <aside
        role="region"
        aria-label={t('title')}
        className={`hidden md:flex flex-col h-full min-h-0 border-r border-border bg-background transition-[width] duration-200 ${
          collapsed ? 'w-12' : 'w-72'
        }`}
      >
        <div className="flex items-center justify-between px-2 py-2 border-b border-border">
          {!collapsed && <span className="text-sm font-semibold">{t('title')}</span>}
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            onPress={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? t('expand') : t('collapse')}
          >
            {collapsed ? <ChevronRightIcon className="w-4 h-4" /> : <ChevronLeftIcon className="w-4 h-4" />}
          </Button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-2">
          {loadingSpinner ??
            (collapsed ? (
              <ul className="flex flex-col items-center gap-1">
                {groups.map((group) => {
                  const def = getDomainDef(group.domain);
                  const Icon = def.icon;
                  const label = getPluginDomainLabel(group.domain) ?? t('domains.' + group.domain);
                  return (
                    <li key={group.domain}>
                      <button
                        type="button"
                        onClick={() => {
                          setCollapsed(false);
                          requestAnimationFrame(() => {
                            document
                              .getElementById('node-catalog-domain-' + group.domain)
                              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          });
                        }}
                        aria-label={label}
                        className={`flex items-center justify-center w-8 h-8 rounded-md ${def.iconBg} ${def.iconFg} hover:ring-2 hover:ring-primary-300 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none`}
                      >
                        <Icon className="w-4 h-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <CatalogContent
                groups={groups}
                isDomainExpanded={isDomainExpanded}
                setDomainExpanded={setDomainExpanded}
                onSelect={onSelect}
                tCatalog={t}
                tNodeTranslations={tNodeTranslations}
              />
            ))}
        </div>
      </aside>

      <StandardDrawer isOpen={isOpen} onOpenChange={setOpen}>
        <DrawerHeader>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
        </DrawerHeader>
        <DrawerBody>
          {loadingSpinner ?? (
            <CatalogContent
              groups={groups}
              isDomainExpanded={isDomainExpanded}
              setDomainExpanded={setDomainExpanded}
              onSelect={handleSelectMobile}
              tCatalog={t}
              tNodeTranslations={tNodeTranslations}
            />
          )}
        </DrawerBody>
      </StandardDrawer>
    </>
  );
});
