import { RuntimeArtifactManifest } from './wago-runtime-artifacts-verification';
import { Readable } from 'node:stream';

export interface RuntimeArtifactMetadata {
  readonly buildId?: string;
  readonly imageId?: string;
  readonly digest: string;
  readonly bytes: number;
  readonly image: string;
  readonly manifest: RuntimeArtifactManifest;
}

export interface RuntimeArtifactUpload {
  bundle: Readable;
  checksum: Readable;
}

export interface VerifiedRuntimeArtifact extends RuntimeArtifactMetadata {
  readonly path: string;
  readonly directory: string;
  cleanup(): Promise<void>;
}
