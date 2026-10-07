import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowAllowsFlowButtonsOnlyForTheActiveSessionOwnerAndRejectsMissingButtons(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it('allows flow buttons only for the active session owner and rejects missing buttons', async () => {
    const start = jest
      .spyOn(scope.service as never as { startFlow: (...args: unknown[]) => Promise<void> }, 'startFlow')
      .mockResolvedValue(undefined);
    scope.resourceUsageService.getActiveSession = jest.fn().mockResolvedValue({ userId: 7 });
    await expect(scope.service.pressButton(1, 'button', 0)).rejects.toThrow('not allowed');
    await expect(scope.service.pressButton(1, 'button', 8)).rejects.toThrow('not allowed');
    await expect(scope.service.pressButton(1, 'button', 7)).rejects.toThrow('UNKNOWN_BUTTON_ID');
    const button = scope.createNode({ id: 'button' });
    scope.nodesById.button = button;
    await scope.service.pressButton(1, 'button', 7);
    expect(start).toHaveBeenCalledWith(button, { payload: {} });
  });
}
