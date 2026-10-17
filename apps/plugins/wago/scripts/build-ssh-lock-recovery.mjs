import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const [hardwareId, outputArgument] = process.argv.slice(2);
if (!/^cc100-[a-f0-9]{16}$/.test(hardwareId ?? '') || !outputArgument) {
  throw new Error('Usage: build-ssh-lock-recovery.mjs cc100-<16 hex characters> <output.ipk>');
}
const output = resolve(outputArgument);
const stage = await mkdtemp(join(tmpdir(), 'wago-ssh-lock-recovery-'));
try {
  const module = join(stage, 'recovery.cjs');
  await build({
    entryPoints: ['apps/plugins/wago/backend/host/shell/lock-recovery.ts'],
    outfile: module,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  const { sshLockRecoveryScript } = createRequire(import.meta.url)(module);
  await mkdir(join(stage, 'control'));
  await writeFile(
    join(stage, 'control', 'control'),
    `Package: attraccess-wago-ssh-lock-recovery
Version: 1.0.1
Architecture: all
Maintainer: Attraccess
Section: admin
Priority: optional
Description: Restore unconfirmed Attraccess SSH access on ${hardwareId}
 Correct unsupported BusyBox flock waits in the management helper and rollback script.
 This package refuses other controllers and already-confirmed SSH changes.
`,
    { mode: 0o644 },
  );
  await writeFile(join(stage, 'control', 'postinst'), sshLockRecoveryScript(hardwareId), { mode: 0o755 });
  await writeFile(join(stage, 'debian-binary'), '2.0\n');
  execFileSync(
    '/usr/bin/tar',
    ['-czf', join(stage, 'control.tar.gz'), '-C', join(stage, 'control'), 'control', 'postinst'],
    { env: { ...process.env, COPYFILE_DISABLE: '1' } },
  );
  // This package runs only postinst; it must not register filesystem root as
  // an installed path with opkg by including a synthetic "." directory.
  execFileSync('/usr/bin/tar', ['-czf', join(stage, 'data.tar.gz'), '-T', '/dev/null'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
  await mkdir(dirname(output), { recursive: true });
  // macOS ar builds Mach-O archives. Write the portable Debian/opkg ar format
  // directly, with no platform-specific symbol table or extended filenames.
  const members = await Promise.all(
    ['debian-binary', 'control.tar.gz', 'data.tar.gz'].map(async (name) => {
      const data = await readFile(join(stage, name));
      const header = `${(name + '/').padEnd(16)}${'0'.padEnd(12)}${'0'.padEnd(6)}${'0'.padEnd(6)}${'100644'.padEnd(8)}${String(data.length).padEnd(10)}\x60\n`;
      return Buffer.concat([Buffer.from(header, 'ascii'), data, ...(data.length % 2 ? [Buffer.from('\n')] : [])]);
    }),
  );
  await writeFile(output, Buffer.concat([Buffer.from('!<arch>\n'), ...members]), { mode: 0o644 });
  process.stdout.write(`Created ${output}\n`);
} finally {
  await rm(stage, { recursive: true, force: true });
}
