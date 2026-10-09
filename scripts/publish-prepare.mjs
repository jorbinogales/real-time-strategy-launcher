// Prepara la carpeta lista para subir al servidor de actualizaciones: dist-updates/{manifest.json, files/<ruta>}.
// Usa enlaces duros cuando puede (no duplica 550 MB en disco); si no, copia.
// Uso: npm run build:content && npm run publish:prepare
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'content');
const OUT = path.join(ROOT, 'dist-updates');
const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));

fs.rmSync(OUT, { recursive: true, force: true });
let linked = 0, copied = 0;
for (const f of manifest.files) {
  const from = path.join(SRC, f.path), to = path.join(OUT, 'files', f.path);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try { fs.linkSync(from, to); linked++; } catch { fs.copyFileSync(from, to); copied++; }
}
fs.copyFileSync(path.join(SRC, 'manifest.json'), path.join(OUT, 'manifest.json'));
console.log(`dist-updates/ listo: v${manifest.version}, ${manifest.files.length} archivos (${linked} enlazados, ${copied} copiados).`);
console.log('Subir el CONTENIDO de dist-updates/ a UPDATE_BASE_URL (manifest.json y files/). Subir manifest.json al final.');
