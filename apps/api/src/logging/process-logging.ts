import { ConsoleLogger, DynamicModule, Logger, Module } from '@nestjs/common';
import { RoutedLogger } from './routed-logger';
import { logLevelsSchema } from './logging.config';

let processLogger: RoutedLogger | undefined;

export function initializeProcessLogging(): RoutedLogger {
  processLogger ??= new RoutedLogger();
  // Also retain Logger.isLevelEnabled() for callers that consult it directly.
  Logger.overrideLogger(processLogger);
  Logger.overrideLogger(logLevelsSchema.parse(process.env.LOG_LEVELS));
  return processLogger;
}

export function flushBootstrapLogs(): void {
  if (!processLogger) Logger.overrideLogger(new ConsoleLogger());
  Logger.flush();
}

export async function shutdownProcessLogging(): Promise<void> {
  flushBootstrapLogs();
  await processLogger?.close();
}

@Module({})
class ApiRuntimeModule {}

// Only the final application owns shutdown. Temporary config contexts share the
// logger via NestFactory options, without registering this lifecycle provider.
export function withLoggingLifecycle(appModule: DynamicModule['module']): DynamicModule {
  return {
    module: ApiRuntimeModule,
    // Nest 11 shuts global modules down after ordinary modules. This root is
    // registered before imported globals, so their shutdown logs also flush.
    global: true,
    imports: [appModule],
    providers: [{ provide: 'API_LOGGING_SHUTDOWN', useValue: { onApplicationShutdown: shutdownProcessLogging } }],
  };
}
