import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { DrawerBody, DrawerHeader, useOverlayState } from '@heroui/react';
import { LabeledSwitch } from '../../../../components/labeledSwitch';

import de from './de.json';
import en from './en.json';
import { FilterProps } from '../../filterProps';
import { StandardDrawer } from '../../../../components/standardDrawer';

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
      <StandardDrawer isOpen={isOpen} onOpenChange={setOpen}>
        <DrawerHeader>{t('drawer.title')}</DrawerHeader>
        <DrawerBody>
          <LabeledSwitch isSelected={filterProps.onlyInUseByMe} onChange={filterProps.onOnlyInUseByMeChanged}>
            {t('drawer.options.onlyInUseByMe')}
          </LabeledSwitch>
          <LabeledSwitch
            isSelected={filterProps.onlyWithPermissions}
            onChange={filterProps.onOnlyWithPermissionsChanged}
          >
            {t('drawer.options.onlyWithPermissions')}
          </LabeledSwitch>
          <LabeledSwitch
            isSelected={filterProps.hideEmptyResourceGroups}
            onChange={filterProps.onHideEmptyResourceGroupsChanged}
          >
            {t('drawer.options.hideEmptyResourceGroups')}
          </LabeledSwitch>
        </DrawerBody>
      </StandardDrawer>
    </>
  );
}
