import { RoleWithUsageDto } from '@attraccess/react-query-client';

export interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  role: RoleWithUsageDto | null;
}
