'use strict';
// Lógica pura de manifests (sin Electron): validación, comparación de versiones y diff por hash.
const crypto = require('node:crypto');
const fs = require('node:fs');

const SEMVER = /^\d+\.\d+\.\d+$/;

function compareVersions(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

// Un manifest remoto decide qué escribimos en disco: se valida todo (rutas sin escapes, hashes, tamaños).
function validateManifest(m) {
  if (!m || typeof m !== 'object' || typeof m.version !== 'string' || !SEMVER.test(m.version) || !Array.isArray(m.files))
    throw new Error('manifest inválido');
  const seen = new Set();
  for (const f of m.files) {
    const p = f && f.path;
    if (typeof p !== 'string' || !p || p.includes('\\') || p.startsWith('/') || /^[a-zA-Z]:/.test(p) ||
        p.split('/').some((s) => s === '' || s === '.' || s === '..') || seen.has(p))
      throw new Error('ruta inválida en manifest: ' + p);
    if (!Number.isSafeInteger(f.size) || f.size < 0 || !/^[0-9a-f]{64}$/.test(f.sha256))
      throw new Error('entrada inválida en manifest: ' + p);
    seen.add(p);
  }
  return m;
}

// ¿Hay actualización? Sí si la versión remota es mayor, o si es la misma y algún hash difiere (reparación).
// Nunca "actualiza" hacia una versión menor. files = solo lo nuevo/cambiado.
function diffManifests(installed, remote) {
  const cmp = compareVersions(remote.version, installed.version);
  if (cmp < 0) return { available: false, files: [], bytes: 0, removed: [] };
  const have = new Map(installed.files.map((f) => [f.path, f.sha256]));
  const files = remote.files.filter((f) => have.get(f.path) !== f.sha256);
  const keep = new Set(remote.files.map((f) => f.path));
  const removed = installed.files.map((f) => f.path).filter((p) => !keep.has(p));
  return { available: cmp > 0 || files.length > 0 || removed.length > 0, files, bytes: files.reduce((n, f) => n + f.size, 0), removed };
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (d) => h.update(d)).on('error', reject).on('end', () => resolve(h.digest('hex')));
  });
}

module.exports = { compareVersions, validateManifest, diffManifests, sha256File };
