import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { type RuntimeState, type StateStore } from './runtime-types';

export class JsonStateStore implements StateStore {
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  async load(): Promise<RuntimeState> {
    try {
      const state = JSON.parse(await readFile(this.path, 'utf8')) as RuntimeState;
      return { outputs: {}, commandIds: [], commandExpiries: {}, ...state };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { outputs: {}, commandIds: [], commandExpiries: {} };
      throw error;
    }
  }

  async save(state: RuntimeState): Promise<void> {
    const contents = JSON.stringify(state);
    const save = this.saveQueue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.next`;
      await writeFile(temporary, contents, { mode: 0o600 });
      await rename(temporary, this.path);
    });
    this.saveQueue = save.catch(() => undefined);
    await save;
  }
}
