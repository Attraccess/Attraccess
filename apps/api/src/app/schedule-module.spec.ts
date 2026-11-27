import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Injectable, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Cron, CronExpression, ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { FileStorageModule } from '../common/modules/file-storage.module';
import storageConfigObject from '../config/storage.config';

const sourceRoot = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

@Injectable()
class ProbeJob {
  @Cron(CronExpression.EVERY_MINUTE)
  tick(): void {
    // registered only
  }
}

@Module({ providers: [ProbeJob] })
class ProbeModule {}

describe('ScheduleModule registration', () => {
  // Every ScheduleModule.forRoot() import registers each @Cron handler again, so jobs would run once per import.
  it('is registered by AppModule only', () => {
    const owners = sourceFiles(sourceRoot)
      .filter((file) => readFileSync(file, 'utf8').includes('ScheduleModule.forRoot('))
      .map((file) => relative(sourceRoot, file));
    expect(owners).toEqual([join('app', 'app.module.ts')]);
  });

  it('registers a cron handler once next to the shared modules', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ load: [storageConfigObject], isGlobal: true, ignoreEnvFile: true }),
        ScheduleModule.forRoot(),
        FileStorageModule,
        ProbeModule,
      ],
    }).compile();
    await moduleRef.init();
    try {
      // Each forRoot() import brings its own registry, and each one runs the handler.
      const registries = moduleRef.get(SchedulerRegistry, { strict: false, each: true });
      expect(registries.reduce((jobs, registry) => jobs + registry.getCronJobs().size, 0)).toBe(1);
    } finally {
      await moduleRef.close();
    }
  });
});
