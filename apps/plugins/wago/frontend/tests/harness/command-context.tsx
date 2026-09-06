import { createContext, useContext } from 'react';

export const CommandContext = createContext({
  resourceId: 91058,
  updateNodeData: (_id: string, _data: Record<string, unknown>): void => {
    throw new Error('Missing fixture command provider');
  },
});

export const useFlowContext = () => useContext(CommandContext);
