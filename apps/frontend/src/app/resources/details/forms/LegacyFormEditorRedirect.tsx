import { Navigate, useParams } from 'react-router-dom';

/**
 * Forms are edited at /forms/:formId now; old links to a resource's form editor land there. An old "new form" link
 * keeps creating a form for its resource.
 */
export function LegacyFormEditorRedirect() {
  const { id, formId } = useParams<{ id: string; formId: string }>();
  if (formId === 'new') {
    return <Navigate to={`/forms/new?scope=resource&resourceId=${id ?? ''}`} replace />;
  }
  return <Navigate to={`/forms/${formId ?? ''}`} replace />;
}
