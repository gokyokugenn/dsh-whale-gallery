import { readFile, writeFile, mkdir, copyFile, readdir, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = file => readFile(path.join(root, file), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const definitions = JSON.parse(await read('themes.json'));
const sources = new Map(JSON.parse(await read('art-sources.json')).map(item => [item.id, item.path]));
for (const directory of ['assets', 'lib', 'preview']) await mkdir(path.join(root, directory), { recursive: true });
const publicKeys = ['id', 'name', 'group', 'tone', 'accent', 'muted', 'paper', 'ink', 'border', 'surface', 'darkAccent', 'motif', 'radius', 'keywords', 'artScale', 'artFlip'];
const themes = [];
const files = new Set();
for (const definition of definitions) {
  const source = sources.get(definition.id);
  const bytes = await readFile(path.isAbsolute(source) ? source : path.resolve(root, source));
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error('Invalid PNG: ' + definition.id);
  const filename = hash(bytes) + '.png';
  files.add(filename);
  await writeFile(path.join(root, 'assets', filename), bytes);
  const theme = Object.fromEntries(publicKeys.map(key => [key, definition[key]]));
  theme.image = '/skin-assets/whale-gallery/' + filename;
  themes.push(theme);
  if (theme.id === 'celadon' && !existsSync(path.join(root, 'preview/default.png'))) await writeFile(path.join(root, 'preview/default.png'), bytes);
}
for (const name of await readdir(path.join(root, 'assets'))) {
  if (/^[a-f0-9]{64}\.png$/.test(name) && !files.has(name)) await unlink(path.join(root, 'assets', name));
}
await writeFile(path.join(root, 'assets/manifest.json'), JSON.stringify({ files: [...files].sort() }, null, 2) + '\n');
const css = await read('src/skin.css');
const source = (await read('src/client.js')).replace('export const inject', 'const inject').replace('export function apply', 'function apply');
const bundle = 'window.__ModuleLoader__.load({id:"dsh-whale-gallery",factory:(require)=>{\n"use strict";\nconst THEMES=' + JSON.stringify(themes) + ';\nconst CSS_TEXT=' + JSON.stringify(css) + ';\n' + source + '\nreturn {inject,apply};\n}});\n';
await writeFile(path.join(root, 'lib/client.js'), bundle);
await copyFile(path.join(root, 'src/index.js'), path.join(root, 'lib/index.js'));
await writeFile(path.join(root, 'lib/themes.json'), JSON.stringify(themes, null, 2) + '\n');
await writeFile(path.join(root, 'build-info.json'), JSON.stringify({ schemaVersion: 1, package: 'dsh-whale-gallery', version: '0.1.0', targetDsh: '0.2.1-rc.3', themes: themes.length, clientSha256: hash(bundle), artwork: [...files].sort() }, null, 2) + '\n');
console.log(JSON.stringify({ themes: themes.length, artwork: files.size, clientBytes: Buffer.byteLength(bundle) }));
