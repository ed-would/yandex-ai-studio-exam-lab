import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

if (!existsSync(path.join(root, '.git'))) {
  console.log('Git hooks skipped: this directory is an archive without .git.');
} else {
  const executable = path.join(root, 'node_modules/lefthook/bin/index.js');
  const installed = spawnSync(process.execPath, [executable, 'install'], { cwd: root, stdio: 'inherit' });
  if (installed.error) throw installed.error;
  if (installed.status !== 0)
    throw new Error('Lefthook installation failed. Run npm run hooks:install after resolving the error.');

  const located = spawnSync('git', ['rev-parse', '--git-path', 'hooks/pre-commit'], { cwd: root, encoding: 'utf8' });
  if (located.error) throw located.error;
  if (located.status !== 0 || !located.stdout.trim()) throw new Error('Cannot locate the Git pre-commit hook.');
  const hookPath = path.resolve(root, located.stdout.trim());
  if (!existsSync(hookPath)) throw new Error('Lefthook did not install the pre-commit hook.');
  const hook = readFileSync(hookPath, 'utf8');
  if (!hook.includes('call_lefthook') || !hook.includes('pre-commit'))
    throw new Error('The pre-commit hook is not managed by Lefthook.');
  console.log('Lefthook pre-commit installed and verified.');
}
