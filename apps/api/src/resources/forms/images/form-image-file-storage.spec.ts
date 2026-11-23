import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FORM_IMAGE_DIRECTORY, FormImageFileStorage } from './form-image-file-storage';

describe('FormImageFileStorage', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'form-image-storage-'));
  const storage = new FormImageFileStorage({
    get: () => ({ root, cdn: { root: path.join(root, 'cdn'), serveRoot: '/cdn' } }),
  } as never);

  it('keeps the files in a private directory next to, not inside, the public CDN tree', async () => {
    await storage.write('a.jpg', Buffer.from('x'));

    expect(fs.existsSync(path.join(root, FORM_IMAGE_DIRECTORY, 'a.jpg'))).toBe(true);
    expect(FORM_IMAGE_DIRECTORY).not.toMatch(/cdn/);
    expect(fs.existsSync(path.join(root, 'cdn', 'a.jpg'))).toBe(false);
    expect(fs.statSync(path.join(root, FORM_IMAGE_DIRECTORY, 'a.jpg')).mode & 0o077).toBe(0);
  });

  it.each(['../secret.jpg', '../../etc/passwd', 'sub/dir.jpg', '/etc/passwd'])('refuses %p', async (name) => {
    await expect(storage.open(name)).rejects.toBeInstanceOf(NotFoundException);
    await expect(storage.write(name, Buffer.from('x'))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removing a missing file is fine', async () => {
    await expect(storage.remove('missing.jpg')).resolves.toBeUndefined();
  });
});
