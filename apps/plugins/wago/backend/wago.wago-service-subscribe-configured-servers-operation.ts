import { WagoServiceRestoreUnclaimedControllerWhileLockedOperation } from './wago.wago-service-restore-unclaimed-controller-while-locked-operation';


export abstract class WagoServiceSubscribeConfiguredServersOperation extends WagoServiceRestoreUnclaimedControllerWhileLockedOperation {
  protected async subscribeConfiguredServers(): Promise<void> {
    if (this.destroyed) return;
    const rebuild = this.subscriptionRebuild.then(() => this.rebuildSubscriptions());
    this.subscriptionRebuild = rebuild.catch(() => undefined);
    return rebuild;
  }
}
