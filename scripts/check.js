import { readdir, readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

async function checkDirectory(directory) {
  for (const file of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${file.name}`;
    if (file.isDirectory()) await checkDirectory(path);
    else if (path.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
  }
}
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
assert.equal(manifest.manifest_version, 3);
for (const path of [manifest.background.service_worker, manifest.action.default_popup,
  manifest.options_page, ...manifest.content_scripts.flatMap(script => script.js)]) await access(path);
await checkDirectory('src');
await checkDirectory('scripts');
console.log('Manifest entry points exist; all source and script JavaScript passes syntax checks.');
