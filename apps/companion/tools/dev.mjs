// Dev launcher: esbuild --watch on main + preload, relaunch Electron on rebuild.
// The wizard renderer runs under Vite (HMR) via the parallel `serve` command;
// main.ts loads COMPANION_DEV_RENDERER_URL when set instead of the dist build.
// Run from apps/companion (the `serve` target sets cwd).
import * as esbuild from 'esbuild';
import { spawn } from 'node:child_process';
import electronPath from 'electron';

const rendererUrl = `http://localhost:${process.env.COMPANION_RENDERER_PORT ?? '5273'}/`;

let app = null;
let timer = null;
function relaunch() {
  app?.kill();
  app = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    env: { ...process.env, COMPANION_DEV_RENDERER_URL: rendererUrl },
  });
}
// debounce so the initial build of both contexts launches Electron once
const scheduleRelaunch = () => {
  clearTimeout(timer);
  timer = setTimeout(relaunch, 100);
};

const common = { bundle: true, platform: 'node', format: 'cjs', external: ['electron', 'usb'] };
const relaunchPlugin = { name: 'relaunch-electron', setup: (b) => b.onEnd(scheduleRelaunch) };

const main = await esbuild.context({
  ...common,
  entryPoints: ['src/main.ts'],
  outfile: 'out/main.js',
  alias: { '@attraccess/companion-ws-client': '../../libs/companion-ws-client/src/index.ts' },
  plugins: [relaunchPlugin],
});
const preload = await esbuild.context({
  ...common,
  entryPoints: ['src/preload.ts'],
  outfile: 'out/preload.js',
  plugins: [relaunchPlugin],
});

await Promise.all([main.watch(), preload.watch()]);
console.log(`[companion] watching src/ — Electron relaunches on change. Wizard HMR: ${rendererUrl}`);

const stop = () => { app?.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
