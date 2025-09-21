import { TableBodyProps } from '@heroui/react';
import { QueryStatus } from '@tanstack/react-query';

export function useReactQueryStatusToHeroUiTableLoadingState(
  status: QueryStatus,
): TableBodyProps<unknown>['loadingState'] {
  switch (status) {
    case 'pending':
      return 'loading';
    case 'error':
      return 'error';
    case 'success':
      return 'idle';
    default:
      return 'idle';
  }
}
