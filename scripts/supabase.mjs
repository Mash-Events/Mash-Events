// Runs the project's Supabase CLI with this project's own access token.
//
// The token lives in .env.local (git-ignored) as SUPABASE_ACCESS_TOKEN, so the
// CLI acts on the Mash Supabase account without replacing any other Supabase
// login saved on this machine. Usage: npm run sb -- <supabase args>
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
}

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.error(
    'SUPABASE_ACCESS_TOKEN is not set. Run scripts/set-supabase-token.ps1 first.'
  );
  process.exit(1);
}

const require = createRequire(import.meta.url);
const cliPackage = require.resolve('supabase/package.json');
const cli = path.join(path.dirname(cliPackage), 'dist', 'supabase.js');

const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
