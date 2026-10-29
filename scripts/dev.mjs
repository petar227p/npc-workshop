// Runs the server and the web dev server together, and stops both when either exits or on Ctrl-C.
import { spawn } from 'node:child_process';

const windows = process.platform === 'win32';

// Through the npm that started this script, run by node itself: on Windows `npm` is a .cmd file, which node
// won't spawn without a shell. Neither needs stdin (Ctrl-C reaches this script), and on Windows vite can hang
// on startup when it inherits a preview tool's stdin.
const stdio = ['ignore', 'inherit', 'inherit'];
const npm = (args, env) =>
  process.env.npm_execpath
    ? spawn(process.execPath, [process.env.npm_execpath, ...args], { stdio, env })
    : spawn('npm', args, { stdio, env, shell: windows });

// The server is pinned to 8787 (web/vite.config.ts proxies there), whatever PORT the shell or a preview tool sets.
const procs = ['server', 'web'].map((w) =>
<<<<<<< Updated upstream
  npm(['run', 'dev', '-w', w], w === 'server' ? { ...process.env, PORT: '8787', NPC_EDITOR_SAVE: '1' } : process.env),
=======
  spawn('npm', ['run', 'dev', '-w', w], { stdio: 'inherit', shell: process.platform === 'win32', env: w === 'server' ? { ...process.env, PORT: '8787', NPC_EDITOR_SAVE: '1' } : process.env }),
>>>>>>> Stashed changes
);
// On Windows a kill stops npm but not the tsx and vite under it, so the whole tree goes.
const kill = (p) => (windows ? spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' }) : p.kill('SIGTERM'));
let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
<<<<<<< Updated upstream
  for (const p of procs) if (p.exitCode === null) kill(p);
=======
  // With a shell on Windows, kill() would stop only the shell, so take the whole process tree down.
  for (const p of procs) {
    if (process.platform === 'win32' && p.pid) spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
    else p.kill('SIGTERM');
  }
>>>>>>> Stashed changes
  process.exitCode = code;
};
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
for (const p of procs) p.on('exit', (code) => stop(code ?? 0));
