import {
  BadRequestException,
  CallHandler,
  ConflictException,
  Controller,
  ExecutionContext,
  Get,
  Inject,
  Injectable,
  NestInterceptor,
  Post,
  ServiceUnavailableException,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { Request } from 'express';
import { catchError, concatMap, finalize, from, takeUntil } from 'rxjs';
import {
  openArtifactFile,
  WagoRuntimeArtifactsService,
  WAGO_RUNTIME_MAX_BYTES,
  writeArtifactStream,
} from './wago-runtime-artifacts';

function uploadError(error: unknown) {
  if (error instanceof BadRequestException || error instanceof ConflictException) return error;
  return new BadRequestException('Runtime upload could not be completed. Retry with the signed release files.');
}

/** Guards run before this interceptor allocates disk or reads multipart bytes. */
@Injectable()
export class WagoArtifactUploadInterceptor implements NestInterceptor {
  private uploads = 0;
  constructor(@Inject(WagoRuntimeArtifactsService) private readonly artifacts: WagoRuntimeArtifactsService) {}
  async intercept(context: ExecutionContext, next: CallHandler) {
    if (this.uploads >= 2) throw new ConflictException('Two runtime uploads are already in progress');
    const request = context.switchToHttp().getRequest<Request>();
    this.uploads++;
    let directory: string | undefined;
    let creating: Promise<void> | undefined;
    let cleanupPromise: Promise<void> | undefined;
    let stopped = false;
    let bodyAccepted = false;
    let timer: NodeJS.Timeout | undefined;
    let cancellationError: BadRequestException | undefined;
    let rejectUpload!: (error: BadRequestException) => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      rejectUpload = reject;
    });
    // Cancellation can happen before either the directory or Multer promise exists.
    void cancelled.catch(() => undefined);
    const streams = new Set<Readable>();
    const writers: Promise<unknown>[] = [];
    const cleanup = () => {
      if (cleanupPromise) return cleanupPromise;
      stopped = true;
      clearTimeout(timer);
      request.off('aborted', abort);
      request.off('error', abort);
      // Release capacity independently of Multer, which may never call back after a disconnect.
      this.uploads--;
      for (const stream of streams) stream.destroy();
      cleanupPromise = (async () => {
        // Creation may still be in flight when cancellation wins the race.
        await creating?.catch(() => undefined);
        await Promise.allSettled(writers);
        try {
          if (directory) await rm(directory, { recursive: true, force: true });
        } catch {
          throw new ServiceUnavailableException('Runtime upload cleanup could not be completed. Retry shortly.');
        }
      })();
      return cleanupPromise;
    };
    const cancel = (message: string) => {
      if (stopped || bodyAccepted) return;
      cancellationError = new BadRequestException(message);
      rejectUpload(cancellationError);
      void cleanup().catch(() => undefined);
    };
    const abort = () => cancel('Runtime upload was interrupted. Retry with the signed release files.');
    try {
      request.once('aborted', abort);
      request.once('error', abort);
      timer = setTimeout(
        () => {
          if (bodyAccepted || stopped) return;
          cancel('Runtime upload timed out. Retry with the signed release files.');
          request.destroy();
        },
        10 * 60 * 1000,
      );
      timer.unref();
      if (request.aborted || (request.destroyed && !request.readableEnded)) abort();
      creating = Promise.resolve().then(async () => {
        if (!stopped) directory = await this.artifacts.createUploadDirectory();
      });
      await Promise.race([creating, cancelled]);
      if (stopped) throw cancellationError;
      if (!directory) throw uploadError(undefined);
      const destination = directory;
      const Interceptor = FileFieldsInterceptor(
        [
          { name: 'bundle', maxCount: 1 },
          { name: 'checksum', maxCount: 1 },
          { name: 'signature', maxCount: 1 },
        ],
        {
          // Busboy emits partsLimit at the boundary after the third part when set to 3.
          // files/fields and maxCount still enforce exactly the three named file parts.
          limits: {
            fileSize: WAGO_RUNTIME_MAX_BYTES,
            files: 3,
            fields: 0,
            parts: 4,
            fieldNameSize: 32,
            headerPairs: 32,
          },
          storage: {
            _handleFile(_request, file, callback) {
              if (stopped) {
                file.stream.destroy();
                callback(cancellationError ?? new BadRequestException('Runtime upload has ended'));
                return;
              }
              streams.add(file.stream);
              const path = join(destination, file.fieldname);
              const writer = writeArtifactStream(
                path,
                file.stream,
                file.fieldname === 'bundle' ? WAGO_RUNTIME_MAX_BYTES : file.fieldname === 'checksum' ? 4096 : 16384,
              );
              writers.push(writer);
              writer.then(
                (size) => {
                  streams.delete(file.stream);
                  callback(null, { path, size });
                },
                () => {
                  streams.delete(file.stream);
                  file.stream.destroy();
                  callback(new BadRequestException('Invalid or oversized runtime upload'));
                },
              );
            },
            _removeFile(_request, _file, callback) {
              callback(null);
            },
          },
        },
      );
      const response = await Promise.race([
        new Interceptor().intercept(context, {
          handle: () => {
            if (stopped) throw cancellationError;
            // The deadline governs body receipt only. Import owns activation once
            // Multer has accepted all files; do not report cancellation mid-import.
            bodyAccepted = true;
            clearTimeout(timer);
            request.off('aborted', abort);
            request.off('error', abort);
            return next.handle();
          },
        }),
        cancelled,
      ]);
      return response.pipe(
        takeUntil(from(cancelled)),
        concatMap(async (result) => {
          await cleanup();
          return result;
        }),
        catchError((error) =>
          from(
            cleanup().then(() => {
              throw uploadError(error);
            }),
          ),
        ),
        finalize(() => {
          void cleanup().catch(() => undefined);
        }),
      );
    } catch (error) {
      await cleanup();
      throw uploadError(error);
    }
  }
}

@Auth('system.settings.manage')
@Controller('wago/runtime-artifacts')
export class WagoArtifactsController {
  constructor(@Inject(WagoRuntimeArtifactsService) private readonly artifacts: WagoRuntimeArtifactsService) {}
  @Get() async list() {
    try {
      return await this.artifacts.list();
    } catch {
      throw new ServiceUnavailableException('Runtime releases could not be loaded. Retry shortly.');
    }
  }
  @Get('current') async current() {
    try {
      return await this.artifacts.current();
    } catch {
      throw new ServiceUnavailableException('The selected runtime release could not be loaded. Retry shortly.');
    }
  }
  @Post('import')
  @UseInterceptors(WagoArtifactUploadInterceptor)
  async import(@UploadedFiles() files: Partial<Record<'bundle' | 'checksum' | 'signature', { path: string }[]>>) {
    if (!files || (['bundle', 'checksum', 'signature'] as const).some((name) => files[name]?.length !== 1))
      throw new BadRequestException('Select the runtime tar, checksum, and signature files');
    const handles: Awaited<ReturnType<typeof openArtifactFile>>[] = [];
    try {
      for (const name of ['bundle', 'checksum', 'signature'] as const) {
        const file = files[name]?.[0];
        if (!file) throw new BadRequestException('Missing release file');
        handles.push(await openArtifactFile(file.path));
      }
      return await this.artifacts.import({
        bundle: handles[0].createReadStream({ autoClose: false }),
        checksum: handles[1].createReadStream({ autoClose: false }),
        signature: handles[2].createReadStream({ autoClose: false }),
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new BadRequestException('Runtime import failed. Check the signed release files and retry.');
    } finally {
      await Promise.allSettled(handles.map((file) => file.close()));
    }
  }
}
