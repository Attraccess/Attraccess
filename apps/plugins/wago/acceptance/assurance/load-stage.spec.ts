import { runLoadStage, measuredRecommendation } from './load-stage';

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

it('recommends the lower achieved throughput from the original and repeated passing stages', async () => {
  async function run(repeat: boolean, drain: number) {
    let time = 0;
    return runLoadStage({
      rate: 100,
      repeat,
      seconds: 4,
      maxPending: 64,
      memoryReached: () => false,
      command: async () => undefined,
      pendingChanged: () => undefined,
      started: () => undefined,
      progress: async () => undefined,
      now: () => time,
      wait: async (ms) => {
        time += ms;
        if (time >= 4000) time += drain;
      },
    });
  }
  const original = await run(false, 10);
  const repeat = await run(true, 20);
  expect(original.passed).toBe(true);
  expect(repeat.passed).toBe(true);
  expect(measuredRecommendation([original], 100)).toBeNull();
  expect(measuredRecommendation([original, repeat], 100)).toBe(repeat.achievedCommandsPerSecond);
  expect(measuredRecommendation([original, repeat], 100)).toBeLessThan(100);
});
