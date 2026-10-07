import { createContext } from 'react';
import type { AttractapSerialCommContextValue } from './index.contracts';

export const AttractapSerialCommContext = createContext<AttractapSerialCommContextValue | undefined>(undefined);
