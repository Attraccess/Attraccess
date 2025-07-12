import { AttractapEvent, AttractapResponse } from '../websocket.types';

export interface ReaderState {
  onEvent(data: AttractapEvent['data']): Promise<void>;
  onResponse(data: AttractapResponse['data']): Promise<void>;

  onStateEnter(): Promise<void>;
  onStateExit(): Promise<void>;
}
