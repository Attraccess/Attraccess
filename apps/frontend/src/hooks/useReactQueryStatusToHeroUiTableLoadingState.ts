// Converts React Query status to a boolean loading flag for tables
// FEATURE: Table loading state utility for HeroUI v3 compatibility
import { QueryStatus } from '@tanstack/react-query';

export function useReactQueryStatusToHeroUiTableLoadingState(status: QueryStatus): boolean {
  return status === 'pending';
}
