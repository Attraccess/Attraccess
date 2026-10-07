import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from '../websocket.types';
import { ReaderUsageSessionImplementation } from './reader-usage-session';
export abstract class ReaderDoorActionsImplementation extends ReaderUsageSessionImplementation {
  public async handleLockDoor(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId } = data.payload as { resourceId: number };

    if (
      !(await this.resourceActionGuard.validateResourceAction(
        socket,
        resourceId,
        AttractapEventType.LOCK_DOOR,
        data.payload?.requestId,
      ))
    ) {
      return;
    }

    const user = await this.usersService.findOne({ id: socket.state.lastAuthenticatedUserId });
    if (!user) {
      await this.reply(socket, data, AttractapEventType.LOCK_DOOR, { error: 'USER_NOT_FOUND' });
      return;
    }

    try {
      await this.resourceUsageService.lockDoor(resourceId, user);
      await this.reply(socket, data, AttractapEventType.LOCK_DOOR, { success: true });
    } catch (error) {
      const errorMessage = this.extractUserFacingError(error);
      this.logger.error(`Failed to lock door: ${errorMessage}`);
      await this.reply(socket, data, AttractapEventType.LOCK_DOOR, { error: errorMessage });
    }
  }

  public async handleUnlockDoor(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId } = data.payload as { resourceId: number };

    if (
      !(await this.resourceActionGuard.validateResourceAction(
        socket,
        resourceId,
        AttractapEventType.UNLOCK_DOOR,
        data.payload?.requestId,
      ))
    ) {
      return;
    }

    const user = await this.usersService.findOne({ id: socket.state.lastAuthenticatedUserId });
    if (!user) {
      await this.reply(socket, data, AttractapEventType.UNLOCK_DOOR, { error: 'USER_NOT_FOUND' });
      return;
    }

    try {
      await this.resourceUsageService.unlockDoor(resourceId, user);
      await this.reply(socket, data, AttractapEventType.UNLOCK_DOOR, { success: true });
    } catch (error) {
      const errorMessage = this.extractUserFacingError(error);
      this.logger.error(`Failed to unlock door: ${errorMessage}`);
      await this.reply(socket, data, AttractapEventType.UNLOCK_DOOR, { error: errorMessage });
    }
  }

  public async handleUnlatchDoor(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId } = data.payload as { resourceId: number };

    if (
      !(await this.resourceActionGuard.validateResourceAction(
        socket,
        resourceId,
        AttractapEventType.UNLATCH_DOOR,
        data.payload?.requestId,
      ))
    ) {
      return;
    }

    const user = await this.usersService.findOne({ id: socket.state.lastAuthenticatedUserId });
    if (!user) {
      await this.reply(socket, data, AttractapEventType.UNLATCH_DOOR, { error: 'USER_NOT_FOUND' });
      return;
    }

    try {
      await this.resourceUsageService.unlatchDoor(resourceId, user);
      await this.reply(socket, data, AttractapEventType.UNLATCH_DOOR, { success: true });
    } catch (error) {
      const errorMessage = this.extractUserFacingError(error);
      this.logger.error(`Failed to unlatch door: ${errorMessage}`);
      await this.reply(socket, data, AttractapEventType.UNLATCH_DOOR, { error: errorMessage });
    }
  }

  public async handleTriggerFlowButton(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId, buttonId } = data.payload as { resourceId: number; buttonId: string };

    if (
      !(await this.resourceActionGuard.validateResourceAction(
        socket,
        resourceId,
        AttractapEventType.TRIGGER_FLOW_BUTTON,
        data.payload?.requestId,
      ))
    ) {
      return;
    }

    try {
      await this.resourceFlowsExecutorService.pressButton(resourceId, buttonId, socket.state.lastAuthenticatedUserId);
      await this.reply(socket, data, AttractapEventType.TRIGGER_FLOW_BUTTON, { success: true });
    } catch (error) {
      this.logger.error(`Failed to trigger flow button: ${error.message}`);
      await this.reply(socket, data, AttractapEventType.TRIGGER_FLOW_BUTTON, { error: error.message });
    }
  }
}
