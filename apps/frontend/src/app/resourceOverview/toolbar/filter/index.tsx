import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { DrawerBody, Drawer, DrawerContent, DrawerHeader, Switch, useOverlayState } from '@heroui/react';

import de from './de.json';
import en from './en.json';
import { FilterProps } from '../../filterProps';

interface Props {
  children: (props: { onOpen: () => void }) => React.ReactNode;
}

export function ResourceFilter(props: Props & Omit<FilterProps, 'onSearchChanged' | 'search'>) {
  const { children, ...filterProps } = props;
  const { isOpen, setOpen, open } = useOverlayState();

  const { t } = useTranslations({
    de,
    en,
  });

  return (
    <>
      {children({ onOpen: open })}
      <Drawer isOpen={isOpen} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>{t('drawer.title')}</DrawerHeader>
          <DrawerBody>
            <Switch isSelected={filterProps.onlyInUseByMe} onValueChange={filterProps.onOnlyInUseByMeChanged}>
              {t('drawer.options.onlyInUseByMe')}
            </Switch>
            <Switch
              isSelected={filterProps.onlyWithPermissions}
              onValueChange={filterProps.onOnlyWithPermissionsChanged}
            >
              {t('drawer.options.onlyWithPermissions')}
            </Switch>
            <Switch
              isSelected={filterProps.hideEmptyResourceGroups}
              onValueChange={filterProps.onHideEmptyResourceGroupsChanged}
            >
              {t('drawer.options.hideEmptyResourceGroups')}
            </Switch>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  );
}
