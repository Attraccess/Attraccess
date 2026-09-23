import { useAuth } from '../../hooks/useAuth';
import { CreateResourceDrawer } from './createResourceDrawer';

export function CreateResourceButton({ testId }: { testId?: string }) {
  const { hasPermission } = useAuth();

  if (!hasPermission('resources.create')) return null;
  return <CreateResourceDrawer testId={testId} />;
}
