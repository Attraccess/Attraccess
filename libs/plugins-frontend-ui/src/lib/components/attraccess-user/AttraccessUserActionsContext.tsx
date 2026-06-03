// React context injecting optional user actions into AttraccessUser display
// FEATURE: User identity display using HeroUI v3 Avatar compound
import { User } from '@attraccess/react-query-client';
import { createContext, useContext, ReactNode } from 'react';

interface AttraccessUserActions {
  onStartDirectMessage?: (user: User) => void;
}

interface AttraccessUserActionsProviderProps extends AttraccessUserActions {
  children: ReactNode;
}

const AttraccessUserActionsContext = createContext<AttraccessUserActions>({});

export function AttraccessUserActionsProvider({
  children,
  onStartDirectMessage,
}: Readonly<AttraccessUserActionsProviderProps>) {
  return (
    <AttraccessUserActionsContext.Provider value={{ onStartDirectMessage }}>
      {children}
    </AttraccessUserActionsContext.Provider>
  );
}

export function useAttraccessUserActions() {
  return useContext(AttraccessUserActionsContext);
}
