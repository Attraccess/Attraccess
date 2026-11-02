import { ModuleRef } from '@nestjs/core';
import {
  queueReaderUiContributions,
  ReaderUiWiring,
  resetReaderUiWiring,
  unregisterReaderUi,
} from './reader-ui-wiring';
import type { ReaderUiRegistry } from '../reader-ui/reader-ui.registry';

function wiringWith(registry: Partial<ReaderUiRegistry>) {
  return new ReaderUiWiring({ get: () => registry } as unknown as ModuleRef);
}

describe('ReaderUiWiring', () => {
  const preStartHook = jest.fn();

  beforeEach(() => resetReaderUiWiring());

  it('hands queued contributions to the registry on init', () => {
    const registry = { register: jest.fn(), unregister: jest.fn() };
    queueReaderUiContributions('demo', { preStartHook });

    wiringWith(registry).onModuleInit();

    expect(registry.register).toHaveBeenCalledWith('demo', { preStartHook });
  });

  it('keeps contributions when an app that never initialised is closed first', () => {
    // The bootstrap creates a throwaway Nest app and closes it before the real one initialises.
    const registry = { register: jest.fn(), unregister: jest.fn() };
    queueReaderUiContributions('demo', { preStartHook });

    unregisterReaderUi('demo');
    wiringWith(registry).onModuleInit();

    expect(registry.register).toHaveBeenCalledWith('demo', { preStartHook });
  });

  it('registers a later load directly and unregisters from the live registry', () => {
    const registry = { register: jest.fn(), unregister: jest.fn() };
    wiringWith(registry).onModuleInit();

    queueReaderUiContributions('late', { preStartHook });
    unregisterReaderUi('late');

    expect(registry.register).toHaveBeenCalledWith('late', { preStartHook });
    expect(registry.unregister).toHaveBeenCalledWith('late');
  });
});
