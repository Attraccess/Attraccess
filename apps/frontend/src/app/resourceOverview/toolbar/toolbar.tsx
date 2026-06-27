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
  const canManageResources = hasPermission('resources.update');
  const navigate = useNavigate();

  const { t } = useTranslations({
    en,
    de,
  });

  return (
    <div>
      <div className="mb-6 flex flex-row w-full items-center justify-between gap-4 rounded-full p-2 shadow-medium bg-content1">
        <div className="relative flex-grow">
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
                    <Button variant="ghost" isIconOnly onPress={onOpen}>
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
            <Button variant="ghost" onPress={onOpen} isIconOnly>
              <ScanQrCodeIcon />
            </Button>
          )}
        </ResourceScanner>
      </div>

      <div className="flex flex-row gap-2 justify-end mb-6">
        {canManageResources && (
          <div className="flex items-center gap-2 mr-1 hidden md:flex">
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
