import { Dependencies } from './wago-command-handler.contracts';
import { WagoCommandHandlerChannelNamesContract } from './wago-command-handler.wago-command-handler-channel-names-contract';


export abstract class WagoCommandHandlerState extends WagoCommandHandlerChannelNamesContract {
  protected readonly pending = new Map<
    string,
    { controllerId: number; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(protected readonly dependencies: Dependencies) {
    super();
  }
}
