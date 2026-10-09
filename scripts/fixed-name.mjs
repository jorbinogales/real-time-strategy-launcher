// Copia dist/MasterWar-Setup-<version>.exe -> dist/MasterWar-Setup.exe (nombre fijo para un enlace estable, p. ej. GitHub Release).
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
const src = path.join(ROOT, 'dist', `MasterWar-Setup-${version}.exe`);
fs.copyFileSync(src, path.join(ROOT, 'dist', 'MasterWar-Setup.exe'));
console.log('dist/MasterWar-Setup.exe listo (copia de ' + path.basename(src) + ', ' + (fs.statSync(src).size / 1048576).toFixed(1) + ' MiB)');
