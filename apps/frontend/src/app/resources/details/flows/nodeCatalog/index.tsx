// NodeCatalogPanel: responsive container hosting CatalogContent in sidebar and mobile overlay
// FEATURE: Node catalog redesign — top-level panel
import { useCallback } from 'react';
import { DrawerBody, DrawerHeader, useOverlayState, Button } from '@heroui/react';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from 'lucide-react';
import { TFunction, useTranslations } from '@attraccess/plugins-frontend-ui';
import { StandardDrawer } from '../../../../../components/standardDrawer';
import { CatalogContent } from './catalogContent';
import { useNodeCatalog } from './useNodeCatalog';
import de from './de.json';
import en from './en.json';

interface Props {
  resourceId: number;
  onSelect: (nodeType: string) => void;
  tNodeTranslations: TFunction;
}

export function NodeCatalogPanel({ resourceId, onSelect, tNodeTranslations }: Props) {
  const { t } = useTranslations({ de, en });
  const { groups, collapsed, setCollapsed, isDomainExpanded, setDomainExpanded } = useNodeCatalog({ resourceId });
  const { isOpen, setOpen, open, close } = useOverlayState();

  const handleSelectMobile = useCallback(
    (nodeType: string) => {
      onSelect(nodeType);
      close();
    },
    [onSelect, close],
  );

  return (
    <>
      <aside
        role="region"
        aria-label={t('title')}
        className={`hidden md:flex flex-col border-r border-default-200 dark:border-default-100 bg-background transition-[width] duration-200 ${
          collapsed ? 'w-12' : 'w-72'
        }`}
      >
        <div className="flex items-center justify-between px-2 py-2 border-b border-default-200 dark:border-default-100">
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
        {!collapsed && (
          <div className="overflow-y-auto p-2">
            <CatalogContent
              groups={groups}
              isDomainExpanded={isDomainExpanded}
              setDomainExpanded={setDomainExpanded}
              onSelect={onSelect}
              tCatalog={t}
              tNodeTranslations={tNodeTranslations}
            />
          </div>
        )}
      </aside>

      <Button
        isIconOnly
        variant="primary"
        onPress={open}
        aria-label={t('toggleOpen')}
        className="md:hidden absolute top-2 left-2 z-10"
      >
        <PlusIcon className="w-4 h-4" />
      </Button>

      <StandardDrawer isOpen={isOpen} onOpenChange={setOpen}>
        <DrawerHeader>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
        </DrawerHeader>
        <DrawerBody>
          <CatalogContent
            groups={groups}
            isDomainExpanded={isDomainExpanded}
            setDomainExpanded={setDomainExpanded}
            onSelect={handleSelectMobile}
            tCatalog={t}
            tNodeTranslations={tNodeTranslations}
          />
        </DrawerBody>
      </StandardDrawer>
    </>
  );
}
