import { Button, TextField, InputGroup } from '@heroui/react';
import { ListFilterIcon, ScanQrCodeIcon, SearchIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { CreateResourceButton } from '../createResourceButton';
import en from './toolbar.en.json';
import de from './toolbar.de.json';
import { ResourceScanner } from './scanner';
import { ResourceFilter } from './filter';
import { FilterProps } from '../filterProps';
import { cn } from '@heroui/react';
import { PageHeader } from '../../../components/pageHeader';

interface ToolbarProps {
  searchIsLoading?: boolean;
  highlightSearch?: boolean;
  highlightFilter?: boolean;
}

export function Toolbar({
  searchIsLoading,
  highlightSearch,
  highlightFilter,
  ...filterProps
}: Readonly<ToolbarProps & FilterProps>) {
  const { t } = useTranslations({
    en,
    de,
  });

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="mb-6 flex flex-wrap w-full items-center gap-3 border-b border-separator pb-6">
        <div className="relative flex-1 min-w-48">
          <TextField
            value={filterProps.search}
            onChange={filterProps.onSearchChanged}
            className={cn((searchIsLoading || highlightSearch) && 'animate-pulse')}
            aria-label={t('searchPlaceholder')}
          >
            <InputGroup>
              <InputGroup.Prefix>
                <ResourceFilter
                  onlyInUseByMe={filterProps.onlyInUseByMe}
                  onOnlyInUseByMeChanged={filterProps.onOnlyInUseByMeChanged}
                  onlyWithPermissions={filterProps.onlyWithPermissions}
                  onOnlyWithPermissionsChanged={filterProps.onOnlyWithPermissionsChanged}
                  hideEmptyResourceGroups={filterProps.hideEmptyResourceGroups}
                  onHideEmptyResourceGroupsChanged={filterProps.onHideEmptyResourceGroupsChanged}
                >
                  {({ onOpen }) => (
                    <Button variant="ghost" isIconOnly aria-label={t('filter')} onPress={onOpen}>
                      <ListFilterIcon size={18} className={cn(highlightFilter && 'animate-pulse')} />
                    </Button>
                  )}
                </ResourceFilter>
                <SearchIcon size={18} />
              </InputGroup.Prefix>
              <InputGroup.Input placeholder={t('searchPlaceholder')} data-cy="resource-search-input" />
            </InputGroup>
          </TextField>
        </div>

        <ResourceScanner>
          {(onOpen: () => void) => (
            <Button variant="outline" onPress={onOpen} isIconOnly aria-label={t('scan')}>
              <ScanQrCodeIcon />
            </Button>
          )}
        </ResourceScanner>
        <CreateResourceButton testId="toolbar-open-create-resource-modal-button" />
      </div>
    </div>
  );
}
