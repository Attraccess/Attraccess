import { manifest } from './wago-runtime-artifacts.spec.manifest';
import { image } from './wago-runtime-artifacts.spec.image';
import { tarMember } from './wago-runtime-artifacts.spec.tar-member';

export function bundle(value: unknown = manifest, reference = image, extra = Buffer.alloc(0)) {
  return Buffer.concat([
    tarMember('image.tar', 'isolated image fixture'),
    tarMember('image-reference', `${reference}\n`),
    tarMember('manifest.json', JSON.stringify(value)),
    extra,
    Buffer.alloc(1024),
  ]);
}
