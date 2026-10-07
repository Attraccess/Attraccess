import { RuntimeArtifactMetadata } from './wago-runtime-artifacts.contracts';
import { VerifiedRuntimeArtifact } from './wago-runtime-artifacts.contracts';
import { RuntimeArtifactUpload } from './wago-runtime-artifacts.contracts';

export abstract class WagoRuntimeArtifactCatalogRootContract {
  abstract root(): Promise<string>;
  abstract onModuleInit(): Promise<void>;
  abstract onModuleDestroy(): Promise<void>;
  protected abstract reconcile(root: string): Promise<void>;
  protected abstract createTemporaryDirectory(parent: string, kind: 'upload' | 'delivery'): Promise<string>;
  abstract createUploadDirectory(): Promise<string>;
  protected abstract verify(directory: string): Promise<RuntimeArtifactMetadata>;
  protected abstract writeMetadata(directory: string, metadata: RuntimeArtifactMetadata): Promise<void>;
  protected abstract backfillMetadata(directory: string, metadata: RuntimeArtifactMetadata): Promise<void>;
  protected abstract metadata(root: string, digest: string): Promise<RuntimeArtifactMetadata>;
  protected abstract verifiedMetadata(root: string, digest: string): Promise<RuntimeArtifactMetadata>;
  abstract import(upload: RuntimeArtifactUpload): Promise<RuntimeArtifactMetadata>;
  protected abstract cache(upload: RuntimeArtifactUpload): Promise<RuntimeArtifactMetadata>;
  protected abstract ingest(upload: RuntimeArtifactUpload, publish: boolean): Promise<RuntimeArtifactMetadata>;
  abstract current(): Promise<RuntimeArtifactMetadata | null>;
  abstract get(digest: string): Promise<RuntimeArtifactMetadata>;
  abstract list(): Promise<RuntimeArtifactMetadata[]>;
  abstract has(): Promise<boolean>;
  abstract acquire(digest?: string): Promise<VerifiedRuntimeArtifact>;
}
