// Genera content/: copia filtrada del juego + three vendorizado + fuentes locales + manifest.json.
// Nunca modifica el juego original; solo reescribe las COPIAS de index.html y menu.html.
// Uso: node scripts/build-content.mjs   (GAME_SRC=C:/dev/rts por defecto)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const { sha256File } = createRequire(import.meta.url)('../src/main/manifest.js');

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = process.env.GAME_SRC || 'C:/dev/rts';
const OUT = path.join(ROOT, 'content');
const THREE = path.join(ROOT, 'node_modules/three');
const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();

if (!fs.existsSync(path.join(SRC, 'index.html'))) throw new Error('No encuentro el juego en ' + SRC);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// 1. Copia filtrada: solo index.html, menu.html y assets/ (sin tools/, .git, .tmp, .gitkeep, archivos ocultos).
const skip = (n) => n.startsWith('.') || /^(thumbs\.db|desktop\.ini)$/i.test(n) || n.endsWith('.tmp');
for (const f of ['index.html', 'menu.html']) fs.copyFileSync(path.join(SRC, f), path.join(OUT, f));
fs.cpSync(path.join(SRC, 'assets'), path.join(OUT, 'assets'), { recursive: true, filter: (s) => !skip(path.basename(s)) });

// 2. Detectar qué de three usan las copias (imports de three/addons/...) y vendorizar su cierre de dependencias.
const threeVer = JSON.parse(fs.readFileSync(path.join(THREE, 'package.json'), 'utf8')).version;
if (threeVer !== '0.160.0') throw new Error('three instalado es ' + threeVer + ', el juego pide 0.160.0');
const pages = ['index.html', 'menu.html'].map((f) => path.join(OUT, f));
const addons = new Set();
for (const p of pages) {
  const html = fs.readFileSync(p, 'utf8');
  for (const m of html.matchAll(/['"]three\/addons\/([^'"]+)['"]/g)) addons.add(m[1]);
}
const jsm = path.join(THREE, 'examples/jsm');
const queue = [...addons];
while (queue.length) {              // cierre por imports relativos dentro de los addons
  const rel = queue.pop();
  const code = fs.readFileSync(path.join(jsm, rel), 'utf8');
  for (const m of code.matchAll(/from\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    const dep = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1] || m[2]));
    if (!addons.has(dep)) { addons.add(dep); queue.push(dep); }
  }
}
fs.mkdirSync(path.join(OUT, 'vendor/three'), { recursive: true });
fs.copyFileSync(path.join(THREE, 'build/three.module.js'), path.join(OUT, 'vendor/three/three.module.js'));
for (const rel of addons) {
  const dst = path.join(OUT, 'vendor/three/addons', rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(jsm, rel), dst);
}

// 3. Fuentes locales.
fs.cpSync(path.join(ROOT, 'vendor-src/fonts'), path.join(OUT, 'vendor/fonts'), { recursive: true });

// 4. Reescribir las COPIAS: importmap 100 % local, Google Fonts local, sin preconnect remotos.
const importmap = '<script type="importmap">\n{"imports":{"three":"./vendor/three/three.module.js","three/addons/":"./vendor/three/addons/"}}\n</script>';
for (const p of pages) {
  const before = fs.readFileSync(p, 'utf8');
  const h = before
    .replace(/<script type="importmap">[\s\S]*?<\/script>/, () => importmap)
    .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*">/g, '<link rel="stylesheet" href="vendor/fonts/fonts.css">')
    .replace(/<link rel="preconnect"[^>]*>\s*/g, '');
  if (h === before) throw new Error('no se reescribió nada en ' + p);
  fs.writeFileSync(p, h);
  // Comprobación: no debe quedar ningún recurso remoto (salvo el namespace SVG).
  const remote = [...h.matchAll(/https?:\/\/[^\s"'`)<>]+/g)].map((m) => m[0]).filter((u) => !u.startsWith('http://www.w3.org/'));
  if (remote.length) console.warn('AVISO recursos remotos en', path.basename(p), [...new Set(remote)]);
}

// 5. manifest.json (no se lista a sí mismo).
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full); else files.push(full);
  }
})(OUT);
const entries = [];
for (const full of files) {
  entries.push({ path: path.relative(OUT, full).split(path.sep).join('/'), size: fs.statSync(full).size, sha256: await sha256File(full) });
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ version, generatedAt: new Date().toISOString(), files: entries }, null, 1));
const mb = entries.reduce((n, f) => n + f.size, 0) / 1048576;
console.log(`content/ listo: v${version}, ${entries.length} archivos, ${mb.toFixed(1)} MB, addons three: ${[...addons].join(', ')}`);
