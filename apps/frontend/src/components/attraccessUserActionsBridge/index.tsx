// Wires AttraccessUser direct-message action to the messaging API and routing
// FEATURE: Messaging inbox page
import { ReactNode, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, useMessagingServiceMessagingContactUser } from '@attraccess/react-query-client';
import { AttraccessUserActionsProvider } from '@attraccess/plugins-frontend-ui';

interface AttraccessUserActionsBridgeProps {
  children: ReactNode;
}

export function AttraccessUserActionsBridge({ children }: Readonly<AttraccessUserActionsBridgeProps>) {
  const navigate = useNavigate();

  const { mutate: contactUser } = useMessagingServiceMessagingContactUser({
    onSuccess: (result) => navigate(`/messages?conversation=${result.conversationId}`),
  });

  const onStartDirectMessage = useCallback((user: User) => contactUser({ userId: user.id }), [contactUser]);

  return <AttraccessUserActionsProvider onStartDirectMessage={onStartDirectMessage}>{children}</AttraccessUserActionsProvider>;
}
