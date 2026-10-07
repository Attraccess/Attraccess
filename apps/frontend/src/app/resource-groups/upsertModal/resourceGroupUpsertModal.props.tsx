import { ResourceGroup } from '@attraccess/react-query-client';

export interface Props {
  children: (onOpen: () => void) => React.ReactNode;
  /** If provided, the modal will be in edit mode */
  resourceGroup?: ResourceGroup;
  onUpserted?: (resourceGroup: ResourceGroup) => void;
}
