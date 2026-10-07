import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerAllowsFlowButtonsOnlyForTheActiveSessionOwnerAndRejectsMissingButtonsCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
  it('allows flow buttons only for the active session owner and rejects missing buttons', async () => {
    const start = jest
      .spyOn(fixture.service as never as { startFlow: (...args: unknown[]) => Promise<void> }, 'startFlow')
      .mockResolvedValue(undefined);
    fixture.resourceUsageService.getActiveSession = jest.fn().mockResolvedValue({ userId: 7 });
    await expect(fixture.service.pressButton(1, 'button', 0)).rejects.toThrow('not allowed');
    await expect(fixture.service.pressButton(1, 'button', 8)).rejects.toThrow('not allowed');
    await expect(fixture.service.pressButton(1, 'button', 7)).rejects.toThrow('UNKNOWN_BUTTON_ID');
    const button = fixture.createNode({ id: 'button' });
    fixture.nodesById.button = button;
    await fixture.service.pressButton(1, 'button', 7);
    expect(start).toHaveBeenCalledWith(button, { payload: {} });
  });
}
