/**
 * Runs one render at a time and drops queued work superseded before it starts.
 * Each render allocates separate OpenSCAD runtimes, so stale work must not overlap.
 */
export function createSerialQueue(): (id: number, task: () => Promise<void>) => void {
  let tail: Promise<void> = Promise.resolve();
  let latestId = 0;

  return (id, task) => {
    latestId = id;
    tail = tail
      .then(() => (id === latestId ? task() : undefined))
      // A failed render must not prevent later requests from running.
      .catch(() => undefined);
  };
}
