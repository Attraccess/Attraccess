import { Dropdown, DropdownItem, DropdownMenu, DropdownPopover, DropdownTrigger } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { ChevronDown, Store, Upload } from 'lucide-react';
import { Button } from '../../../../../components/button/index';
import { usePluginsSectionState } from '../state/usePluginSettings';
type Props = Pick<
  ReturnType<typeof usePluginsSectionState>,
  'installedNpmPlugins' | 'checkForUpdates' | 'isCheckingForUpdates' | 't' | 'setIsMarketplaceOpen' | 'setIsUploadOpen'
>;
export function PluginToolbar({
  installedNpmPlugins,
  checkForUpdates,
  isCheckingForUpdates,
  t,
  setIsMarketplaceOpen,
  setIsUploadOpen,
}: Props) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {installedNpmPlugins.size > 0 ? (
        <Button
          variant="secondary"
          size="sm"
          onPress={() => void checkForUpdates()}
          isPending={isCheckingForUpdates}
          data-cy="plugins-list-check-updates-button"
        >
          {t('updatePolicy.checkNow')}
        </Button>
      ) : null}
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
  );
}
