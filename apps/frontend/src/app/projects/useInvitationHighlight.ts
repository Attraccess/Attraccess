import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
export function useInvitationHighlight(hasInvitations: boolean) {
  const [searchParams, setSearchParams] = useSearchParams();
  const invitationRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [highlightedInvitationId, setHighlightedInvitationId] = useState<number | null>(null);
  useEffect(() => {
    const target = searchParams.get('invitationId');
    if (!target) {
      return;
    }
    const invitationId = Number(target);
    if (!invitationId || Number.isNaN(invitationId) || !hasInvitations) {
      return;
    }
    const ref = invitationRefs.current[invitationId];
    if (ref) {
      ref.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedInvitationId(invitationId);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('invitationId');
      setSearchParams(nextParams, { replace: true });
    }
  }, [hasInvitations, searchParams, setSearchParams]);

  useEffect(() => {
    if (!highlightedInvitationId) {
      return;
    }
    const timeout = setTimeout(() => setHighlightedInvitationId(null), 4000);
    return () => clearTimeout(timeout);
  }, [highlightedInvitationId]);

  return { invitationRefs, highlightedInvitationId };
}
