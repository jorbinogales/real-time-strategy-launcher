// Empaqueta content/ en build/content.7z (+ build/content-size.nsh) para que el instalador lo extraiga con
// Nsis7z::ExtractWithCallback y pueda mostrar "NN %". Se ejecuta solo antes de `npm run dist` (predist).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'content');
const OUT = path.join(ROOT, 'build', 'content.7z');
const SEVENZ = path.join(ROOT, 'node_modules/electron-winstaller/vendor/7z.exe');   // dependencia transitiva de electron-builder
if (!fs.existsSync(path.join(SRC, 'manifest.json'))) throw new Error('Falta content/: ejecuta npm run build:content');
if (!fs.existsSync(SEVENZ)) throw new Error('No encuentro 7z.exe en ' + SEVENZ);

fs.rmSync(OUT, { force: true });
const r = spawnSync(SEVENZ, ['a', '-t7z', '-mx=5', '-md=128m', '-mmt=on', '-bd', '-y', OUT, '*'], { cwd: SRC, stdio: 'inherit' });
if (r.status !== 0) throw new Error('7z falló');

let bytes = 0;
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : (bytes += fs.statSync(p).size); } })(SRC);
fs.writeFileSync(path.join(ROOT, 'build', 'content-size.nsh'), `!define CONTENT_SIZE_KB ${Math.ceil(bytes / 1024)}\n`);
console.log(`build/content.7z: ${(fs.statSync(OUT).size / 1048576).toFixed(1)} MiB (contenido ${(bytes / 1048576).toFixed(1)} MiB)`);
