import { Button } from '@attraccess/plugins-frontend-ui';
import { usePluginsServicePluginControllerCheckAllInstalledPackages } from '@attraccess/react-query-client';
import { Dropdown, DropdownItem, DropdownMenu, DropdownPopover, DropdownTrigger } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { ChevronDown, Store, Upload } from 'lucide-react';
import { useToastMessage } from '../../../../../components/toastProvider';
import { usePluginsTranslations } from '../usePluginsTranslations';
import { useInstalledNpmPlugins } from './useInstalledNpmPlugins';

interface Props {
  onOpenMarketplace: () => void;
  onOpenUpload: () => void;
}

export function PluginToolbar({ onOpenMarketplace, onOpenUpload }: Props) {
  const { t } = usePluginsTranslations();
  const toast = useToastMessage();
  const { installed, mergeInstalled } = useInstalledNpmPlugins();
  const { mutateAsync: checkAllInstalledPackages, isPending: isCheckingForUpdates } =
    usePluginsServicePluginControllerCheckAllInstalledPackages();

  const checkForUpdates = async () => {
    try {
      const checked = await checkAllInstalledPackages();
      mergeInstalled(checked);
      if (checked.some((plugin) => plugin.updateCheck?.state === 'failed')) {
        toast.error({ title: t('updatePolicy.checkError') });
      } else {
        toast.success({ title: t('updatePolicy.checked') });
      }
    } catch {
      toast.error({ title: t('updatePolicy.checkError') });
    }
  };

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {installed.length > 0 ? (
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
            <DropdownItem id="marketplace" onPress={onOpenMarketplace}>
              <Store size={16} />
              {t('marketplace.open')}
            </DropdownItem>
            <DropdownItem id="upload" onPress={onOpenUpload}>
              <Upload size={16} />
              {t('uploadButton')}
            </DropdownItem>
          </DropdownMenu>
        </DropdownPopover>
      </Dropdown>
    </div>
  );
}
