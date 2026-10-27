import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// Reads the repo-root .env once. A missing file is fine (the host sets real env vars).
let loaded = false;
export function loadEnv(): NodeJS.ProcessEnv {
  if (!loaded) {
    loaded = true;
    try {
      process.loadEnvFile(`${REPO_ROOT}.env`);
    } catch {
      // no .env
    }
  }
  return process.env;
}
