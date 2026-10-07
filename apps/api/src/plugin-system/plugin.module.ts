import { Global, Module } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource as HostDataSource } from 'typeorm';
import { PluginModuleLoadingImplementation } from './plugin-module-loading';

@Global()
@Module({})
export class PluginModule extends PluginModuleLoadingImplementation {
  // Host singletons are only available once the DI container is live, which is
  // after forRoot() has already built the plugin modules. The context exposes
  // them through these holders, populated by the module constructor below.

  constructor(dataSource: HostDataSource, events: EventEmitter2, moduleRef: ModuleRef) {
    super();
    PluginModule.dataSourceRef = dataSource;
    PluginModule.eventsRef = events;
    PluginModule.moduleRef = moduleRef;
  }
}
