import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
const app = fileURLToPath(new URL('../', import.meta.url));
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const out = fileURLToPath(new URL('../../docs/evidence/dd-app-0/', import.meta.url));
await mkdir(out, { recursive: true });
const checks = [];
const npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
function run(name, args, cwd = app) {
  const result = spawnSync(process.execPath, args, { cwd, windowsHide: true, encoding: 'utf8', timeout: 120000 });
  checks.push({ name, exitCode: result.status, error: result.error?.message });
  return writeFile(join(out, `${name}.log`), (result.stdout || '') + (result.stderr || ''));
}
for (const folder of ['src/core', 'src/store', 'tests', 'scripts']) {
  for (const entry of await readdir(join(app, folder))) if (entry.endsWith('.mjs')) await run(`syntax-${entry}`, ['--check', join(folder, entry)]);
}
await run('syntax-sync', ['--check', 'sync-server.mjs']);
await run('build', [npm, 'run', 'build']);
await run('test', [npm, 'test']);
await run('measure-unit-directory', ['--test', 'apps/di-dau/measure/unit/'], root);
await run('measure-unit', ['--test', ...((await readdir(join(root, 'apps/di-dau/measure/unit'))).filter(name => name.endsWith('.test.mjs')).map(name => `apps/di-dau/measure/unit/${name}`))], root);
await writeFile(join(out, 'checks.json'), JSON.stringify(checks, null, 2));
console.log(checks);
if (checks.some(check => check.exitCode !== 0 && check.name !== 'measure-unit-directory')) process.exitCode = 1;
