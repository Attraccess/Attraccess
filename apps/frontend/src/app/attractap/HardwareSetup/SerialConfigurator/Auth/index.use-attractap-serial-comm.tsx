import { useContext } from 'react';
import type { AttractapSerialCommContextValue } from './index.contracts';
import { AttractapSerialCommContext } from './index.attractap-serial-comm-context';

export function useAttractapSerialComm(): AttractapSerialCommContextValue {
  const ctx = useContext(AttractapSerialCommContext);
  if (!ctx) {
    throw new Error('useAttractapSerialComm must be used within AttractapSerialCommProvider');
  }
  return ctx;
}
