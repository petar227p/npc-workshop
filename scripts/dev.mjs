// Runs the server and the web dev server together, and stops both when either exits or on Ctrl-C.
import { spawn } from 'node:child_process';

// The server is pinned to 8787 (web/vite.config.ts proxies there), whatever PORT the shell or a preview tool sets.
const procs = ['server', 'web'].map((w) =>
  spawn('npm', ['run', 'dev', '-w', w], { stdio: 'inherit', env: w === 'server' ? { ...process.env, PORT: '8787', NPC_EDITOR_SAVE: '1' } : process.env }),
);
let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const p of procs) p.kill('SIGTERM');
  process.exitCode = code;
};
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
for (const p of procs) p.on('exit', (code) => stop(code ?? 0));
