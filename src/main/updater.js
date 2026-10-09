'use strict';
// Consulta de actualizaciones y aplicación: descarga solo los archivos nuevos/cambiados a una carpeta temporal,
// verifica tamaño + sha256 de cada uno y solo entonces los mueve al overlay y confirma el nuevo manifest.
const fs = require('node:fs');
const path = require('node:path');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const crypto = require('node:crypto');
const { net } = require('electron');
const cfg = require('./config');
const content = require('./content');
const { validateManifest, diffManifests } = require('./manifest');

let pending = null;      // { remote, diff } de la última consulta; startUpdate solo usa esto (el renderer no manda archivos)
let updating = false;

function baseUrl() {
  const u = new URL(cfg.UPDATE_BASE_URL.endsWith('/') ? cfg.UPDATE_BASE_URL : cfg.UPDATE_BASE_URL + '/');
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) throw new Error('UPDATE_BASE_URL debe ser https');
  return u;
}

async function checkUpdate() {
  if (updating) return { status: 'busy' };
  try {
    const res = await net.fetch(new URL('manifest.json', baseUrl()).href, {
      signal: AbortSignal.timeout(cfg.MANIFEST_TIMEOUT_MS), headers: { 'cache-control': 'no-cache' },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const remote = validateManifest(await res.json());
    const diff = diffManifests(content.getInstalled(), remote);
    pending = diff.available ? { remote, diff } : null;
    return diff.available
      ? { status: 'available', remoteVersion: remote.version, bytes: diff.bytes, files: diff.files.length }
      : { status: 'up-to-date' };
  } catch (e) {
    pending = null;
    return { status: 'unavailable', message: String(e && e.message || e) };   // sin red / servidor caído: se puede jugar igual
  }
}

async function downloadFile(entry, onBytes) {
  const url = new URL('files/' + entry.path.split('/').map(encodeURIComponent).join('/'), baseUrl());
  const dest = path.join(content.tmpDir, entry.path);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let lastErr;
  for (let attempt = 1; attempt <= cfg.DOWNLOAD_RETRIES; attempt++) {
    let counted = 0;
    try {
      const res = await net.fetch(url.href);
      if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
      const hash = crypto.createHash('sha256');
      const tap = new Transform({ transform(chunk, _e, cb) { hash.update(chunk); counted += chunk.length; onBytes(chunk.length); cb(null, chunk); } });
      await pipeline(Readable.fromWeb(res.body), tap, fs.createWriteStream(dest));
      if (counted !== entry.size) throw new Error(`tamaño incorrecto (${counted} != ${entry.size})`);
      if (hash.digest('hex') !== entry.sha256) throw new Error('sha256 no coincide');
      return;
    } catch (e) {
      lastErr = e;
      onBytes(-counted);                     // reintento: se descuenta lo contado
      fs.rmSync(dest, { force: true });
    }
  }
  throw new Error(`${entry.path}: ${lastErr.message}`);
}

async function startUpdate(sendProgress) {
  if (updating) return { ok: false, error: 'Ya hay una actualización en curso' };
  if (!pending) { const c = await checkUpdate(); if (c.status !== 'available') return { ok: false, error: 'No hay actualización disponible' }; }
  updating = true;
  try {
    const { remote, diff } = pending;
    fs.rmSync(content.tmpDir, { recursive: true, force: true });
    let done = 0, last = 0;
    const emit = (force) => {
      const now = Date.now();
      if (force || now - last > 100) { last = now; sendProgress({ done, total: diff.bytes, percent: diff.bytes ? Math.floor((done / diff.bytes) * 100) : 100 }); }
    };
    emit(true);
    const queue = [...diff.files];
    await Promise.all(Array.from({ length: cfg.DOWNLOAD_CONCURRENCY }, async () => {
      for (let f; (f = queue.shift()); ) await downloadFile(f, (n) => { done += n; emit(false); });
    }));
    // Todo descargado y verificado: mover al overlay (rename por archivo, mismo volumen) y confirmar el manifest al final.
    for (const f of diff.files) {
      const dst = path.join(content.overlayDir, f.path);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.renameSync(path.join(content.tmpDir, f.path), dst);
    }
    content.commit(remote);
    for (const p of diff.removed) fs.rmSync(path.join(content.overlayDir, p), { force: true });
    fs.rmSync(content.tmpDir, { recursive: true, force: true });
    pending = null;
    done = diff.bytes; emit(true);
    return { ok: true, version: remote.version };
  } catch (e) {
    fs.rmSync(content.tmpDir, { recursive: true, force: true });
    return { ok: false, error: String(e && e.message || e) };     // el contenido instalado queda intacto
  } finally {
    updating = false;
  }
}

module.exports = { checkUpdate, startUpdate, isUpdating: () => updating };
