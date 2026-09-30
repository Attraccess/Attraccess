import { useNavigate, useParams } from 'react-router-dom';
import { ConfigurationEditor } from './ConfigurationEditor';

export function ConfigurationPage() {
  const { controllerId } = useParams<{ controllerId: string }>();
  const navigate = useNavigate();
  const id = Number(controllerId);
  if (!Number.isSafeInteger(id) || id < 1) return <p role="alert">Invalid controller.</p>;
  return (
    <ConfigurationEditor
      controllerId={id}
      onOpenChange={(open) => {
        if (!open) navigate('/wago');
      }}
    />
  );
}
