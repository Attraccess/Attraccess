import { runLoadStage } from './load-stage';

describe('load generation coverage', () => {
  it.each([1, 500, 1000])('rejects host stalls of %i ms unless the declared load was achieved', async (stall) => {
    let time = 0;
    const stage = await runLoadStage({
      rate: 100,
      repeat: false,
      seconds: 4,
      maxPending: 64,
      memoryReached: () => false,
      command: async () => undefined,
      pendingChanged: () => undefined,
      started: () => undefined,
      progress: async () => undefined,
      now: () => time,
      wait: async (ms) => {
        time += Math.max(stall, ms);
      },
    });
    expect(stage.passed).toBe(stall === 1);
    expect(stage.expectedOffers).toBe(400);
    expect(stage.generationFailures).toBe(400 - stage.offered);
    expect(stage.achievedCommandsPerSecond).toBe(stage.acknowledged / stage.seconds);
    if (stall > 1) expect(stage.generationFailures).toBeGreaterThan(0);
  });
});
