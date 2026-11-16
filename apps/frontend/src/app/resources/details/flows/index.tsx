import { useParams } from 'react-router-dom';
import { FlowEditor } from './FlowEditor';

export default function FlowsPage() {
  const { id: resourceId } = useParams();

  return <FlowEditor owner={{ kind: 'resource', resourceId: Number(resourceId) }} />;
}
