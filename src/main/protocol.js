'use strict';
// Protocolo masterwar://
//   masterwar://game/...      contenido del juego (manifest instalado: overlay de actualizaciones > base). Soporta Range.
//   masterwar://launcher/...  renderer del launcher (launcher/renderer), con CSP estricta.
// Origen estable => localStorage (rts.settings, rts.saves) persiste entre sesiones.
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { app, protocol } = require('electron');
const content = require('./content');

const SCHEME = 'masterwar';
const RENDERER_DIR = path.join(app.getAppPath(), 'launcher/renderer');
const LAUNCHER_CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

function registerScheme() {          // antes de app.ready
  protocol.registerSchemesAsPrivileged([{
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  }]);
}

function serveFile(req, file, extraHeaders = {}) {
  const size = fs.statSync(file).size;
  const headers = {
    'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'accept-ranges': 'bytes',
    ...(file.endsWith('.html') ? { 'cache-control': 'no-cache' } : {}),
    ...extraHeaders,
  };
  let start = 0, end = size - 1, status = 200;
  const range = req.headers.get('range');
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m || (m[1] === '' && m[2] === '')) return new Response(null, { status: 416, headers: { ...headers, 'content-range': `bytes */${size}` } });
    if (m[1] === '') { start = Math.max(0, size - Number(m[2])); }           // bytes=-N : últimos N
    else { start = Number(m[1]); if (m[2] !== '') end = Math.min(Number(m[2]), size - 1); }
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { ...headers, 'content-range': `bytes */${size}` } });
    status = 206;
    headers['content-range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['content-length'] = String(end - start + 1);
  const body = req.method === 'HEAD' || size === 0 ? null : Readable.toWeb(fs.createReadStream(file, { start, end }));
  return new Response(body, { status, headers });
}

function register() {
  protocol.handle(SCHEME, (req) => {
    const url = new URL(req.url);
    let rel;
    try { rel = decodeURIComponent(url.pathname).replace(/^\/+/, ''); } catch { return new Response('bad request', { status: 400 }); }
    if (url.hostname === 'game') {
      if (rel === '') rel = 'menu.html';
      const file = content.resolveGameFile(rel);
      return file ? serveFile(req, file) : new Response('not found', { status: 404 });
    }
    if (url.hostname === 'launcher') {
      if (rel === '') rel = 'index.html';
      const file = path.join(RENDERER_DIR, rel);
      if (!file.startsWith(RENDERER_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('not found', { status: 404 });
      return serveFile(req, file, file.endsWith('.html') ? { 'content-security-policy': LAUNCHER_CSP } : {});
    }
    return new Response('not found', { status: 404 });
  });
}

module.exports = { registerScheme, register };
