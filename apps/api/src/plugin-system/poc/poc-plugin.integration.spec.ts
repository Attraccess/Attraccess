import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityTarget, ObjectLiteral, Repository } from 'typeorm';
import { PluginContext } from '@attraccess/plugins-backend-sdk';
import pocPlugin from './poc-plugin.module';
import { PocNote } from './poc-note.entity';
import { POC_PING_EVENT, POC_PONG_EVENT } from './poc-plugin.service';

describe('Backend plugin PoC — PluginContext injection + event round-trip (ATT-454)', () => {
  let dataSource: DataSource;
  let events: EventEmitter2;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      entities: [PocNote],
    });
    await dataSource.initialize();

    events = new EventEmitter2();

    const context: PluginContext = {
      manifest: { id: 'poc', name: 'poc-plugin', version: '1.0.0', pluginDirectory: 'poc-plugin' },
      events,
      dataSource,
      logger: new Logger('poc-plugin'),
      getRepository: <T extends ObjectLiteral>(entity: EntityTarget<T>): Repository<T> =>
        dataSource.getRepository(entity),
      get: () => {
        throw new Error('host provider resolution not exercised by the PoC');
      },
    };

    moduleRef = await Test.createTestingModule({ imports: [pocPlugin.register(context)] }).compile();
    await moduleRef.init();
  });

  afterAll(async () => {
    await moduleRef?.close();
    await dataSource?.destroy();
  });

  it('receives a host event, writes via the injected host repository, and emits back', async () => {
    const pong = new Promise<number>((resolve) => events.once(POC_PONG_EVENT, resolve));

    events.emit(POC_PING_EVENT, 'hello');

    const noteId = await pong;
    expect(noteId).toBeGreaterThan(0);

    const note = await dataSource.getRepository(PocNote).findOneByOrFail({ id: noteId });
    expect(note.message).toBe('poc-plugin:hello');
  });
});
