import { ESPToolsEvent } from './esp-tools.contracts';
import { ESPToolsEventData } from './esp-tools.contracts';
import { ESPToolsState } from './esp-tools.esptools-state';

export abstract class ESPToolsEmitOperation extends ESPToolsState {
  protected emit<TEvent extends ESPToolsEvent>(event: TEvent, data: ESPToolsEventData[TEvent]): void {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }
}
