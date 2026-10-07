import { EventListener } from './esp-tools.contracts';
import { ESPToolsEvent } from './esp-tools.contracts';
import { ESPToolsEventData } from './esp-tools.contracts';
import { ESPToolsOnOperation } from './esp-tools.esptools-on-operation';

export abstract class ESPToolsOffOperation extends ESPToolsOnOperation {
  public off<TEvent extends ESPToolsEvent>(event: TEvent, listener: EventListener<ESPToolsEventData[TEvent]>): void {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this._eventListeners.delete(event);
      }
    }
  }
}
