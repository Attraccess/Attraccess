import { EventListener } from './esp-tools.contracts';
import { ESPToolsEvent } from './esp-tools.contracts';
import { ESPToolsEventData } from './esp-tools.contracts';
import { ESPToolsEmitOperation } from './esp-tools.esptools-emit-operation';

export abstract class ESPToolsOnOperation extends ESPToolsEmitOperation {
  public on<TEvent extends ESPToolsEvent>(event: TEvent, listener: EventListener<ESPToolsEventData[TEvent]>): void {
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, new Set());
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this._eventListeners.get(event) as Set<EventListener<any>>).add(listener);
  }
}
