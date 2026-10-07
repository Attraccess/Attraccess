import { useParams, useSearchParams } from 'react-router-dom';
import { NotFound } from '../../not-found';
import { UserDetails } from './UserDetails';

// `/users/:id` also matches paths like `/users/security`, which used to render a detail page for a
// user that cannot exist — heading `(ID: )`, empty body. A non-numeric segment is not a user (ATT-869).
export function UserManagementDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  if (!/^\d+$/.test(id ?? '')) {
    return <NotFound />;
  }

  return <UserDetails id={Number(id)} roleIdToAssign={Number(searchParams.get('assignRoleId')) || undefined} />;
}
