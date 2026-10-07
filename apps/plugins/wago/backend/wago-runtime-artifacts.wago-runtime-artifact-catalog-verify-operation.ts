import { join } from 'node:path';
import { RuntimeArtifactMetadata } from './wago-runtime-artifacts.contracts';
import { createHash } from 'node:crypto';
import { inspectRuntimeTar } from './wago-runtime-artifacts-verification';
import { openArtifactFile } from './wago-runtime-artifacts.helpers';
import { smallFile } from './wago-runtime-artifacts.helpers';
import { WagoRuntimeArtifactCatalogCreateUploadDirectoryOperation } from './wago-runtime-artifacts.wago-runtime-artifact-catalog-create-upload-directory-operation';


export abstract class WagoRuntimeArtifactCatalogVerifyOperation extends WagoRuntimeArtifactCatalogCreateUploadDirectoryOperation {
  protected async verify(directory: string): Promise<RuntimeArtifactMetadata> {
    const file = await openArtifactFile(join(directory, 'runtime.tar'));
    try {
      const bytes = (await file.stat()).size;
      if (!bytes || bytes > this.maxBytes) throw new Error('Runtime artifact exceeds the size limit');
      const hash = createHash('sha256');
      for await (const chunk of file.createReadStream({ start: 0, autoClose: false })) hash.update(chunk);
      const digest = hash.digest('hex');
      const checksum = await smallFile(join(directory, 'runtime.tar.sha256'), 4096);
      if (!new RegExp(`^${digest}(?:[ \\t]+\\*?[A-Za-z0-9_.-]+\\.tar)?\\r?\\n?$`).test(checksum))
        throw new Error('Runtime artifact checksum does not match');
      const manifest = await inspectRuntimeTar(file, bytes);
      return Object.freeze({ digest, bytes, image: manifest.image, manifest });
    } finally {
      await file.close();
    }
  }
}
