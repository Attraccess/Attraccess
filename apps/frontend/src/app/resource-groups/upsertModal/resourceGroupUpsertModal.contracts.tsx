import { CreateResourceGroupDto } from '@attraccess/react-query-client';
import { UpdateResourceGroupDto } from '@attraccess/react-query-client';
import { ResourceGroup } from '@attraccess/react-query-client';
export // Define a more specific type for the expected error structure from the API
interface ApiValidationError {
  errors?: {
    [key: string]: string[];
  };
  message?: string; // General error message field
}

export type FormData = CreateResourceGroupDto | UpdateResourceGroupDto;

export interface Props {
  children: (onOpen: () => void) => React.ReactNode;
  /** If provided, the modal will be in edit mode */
  resourceGroup?: ResourceGroup;
  onUpserted?: (resourceGroup: ResourceGroup) => void;
}
