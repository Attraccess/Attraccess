import { createContext } from 'react';
import type { FlowContextType } from './flowContext.contracts';

export const FlowContext = createContext<FlowContextType | undefined>(undefined);
