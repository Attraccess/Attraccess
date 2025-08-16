export interface FilterProps {
  search: string;
  onSearchChanged: (value: string) => void;
  onlyInUseByMe: boolean;
  onOnlyInUseByMeChanged: (value: boolean) => void;
  onlyWithPermissions: boolean;
  onOnlyWithPermissionsChanged: (value: boolean) => void;
  hideEmptyResourceGroups: boolean;
  onHideEmptyResourceGroupsChanged: (value: boolean) => void;
}
