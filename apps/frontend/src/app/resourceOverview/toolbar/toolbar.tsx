import { Button, TextField, InputGroup } from '@heroui/react';
import { ListFilterIcon, PlusIcon, ScanQrCodeIcon, SearchIcon } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ResourceEditModal } from '../../resources/editModal/resourceEditModal';
import { useNavigate } from 'react-router-dom';
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
  const { hasPermission } = useAuth();
  const canUpdateResources = hasPermission('resources.update');
  const navigate = useNavigate();

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
        {canUpdateResources && (
          <div className="flex items-center gap-2">
            <ResourceEditModal onUpdated={(resource) => navigate(`/resources/${resource.id}`)} closeOnSuccess>
              {(onOpen: () => void) => (
                <Button variant="primary" onPress={onOpen} data-cy="toolbar-open-create-resource-modal-button">
                  <PlusIcon size={18} />
                  {t('addResource')}
                </Button>
              )}
            </ResourceEditModal>
          </div>
        )}
      </div>
    </div>
  );
}
