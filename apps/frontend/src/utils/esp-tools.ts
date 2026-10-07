import { ESPToolsErrorType } from './esp-tools.esptools-error-type';
import type { ESPToolsResult } from './esp-tools.contracts';
import type { Command } from './esp-tools.contracts';
import type { ConnectionStateEvent } from './esp-tools.contracts';
import type { ESPToolsEvent } from './esp-tools.contracts';
import type { ESPToolsEventData } from './esp-tools.contracts';
import { ESPToolsSendCommandOperation } from './esp-tools.esptools-send-command-operation';

export class ESPTools extends ESPToolsSendCommandOperation {
  private constructor() {
    super();
  }

  private static _instance: ESPTools;

  public static getInstance(): ESPTools {
    if (!ESPTools._instance) {
      ESPTools._instance = new ESPTools();
    }
    return ESPTools._instance;
  }
}

export { ESPToolsErrorType };
export { type ESPToolsResult };
export { type Command };
export { type ConnectionStateEvent };
export { type ESPToolsEvent };
export { type ESPToolsEventData };
