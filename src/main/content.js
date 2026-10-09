'use strict';
// Estado del contenido del juego.
//   base     = resources/content (lo que trajo el instalador; solo lectura)
//   overlay  = <userData>/updates/content (archivos descargados por el updater; tienen prioridad sobre base)
//   estado   = <userData>/content-state.json  { baseId, manifest }  (manifest instalado = base + actualizaciones)
// Los datos del usuario (localStorage: ajustes y partidas) viven en el perfil de Electron y no se tocan nunca aquí.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { validateManifest } = require('./manifest');

const baseDir = app.isPackaged ? path.join(process.resourcesPath, 'content') : path.join(__dirname, '../../content');
const updatesDir = path.join(app.getPath('userData'), 'updates');
const overlayDir = path.join(updatesDir, 'content');
const tmpDir = path.join(updatesDir, 'tmp');
const stateFile = path.join(app.getPath('userData'), 'content-state.json');

let installed = null;     // manifest instalado
let fileSet = new Set();

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
function writeJsonAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

function init() {
  const base = validateManifest(readJson(path.join(baseDir, 'manifest.json')));
  const baseId = base.version + '|' + base.generatedAt;   // cambia al reinstalar/recompilar: el contenido del instalador manda
  let state = null;
  try { state = readJson(stateFile); validateManifest(state.manifest); } catch { state = null; }
  if (!state || state.baseId !== baseId) {
    fs.rmSync(updatesDir, { recursive: true, force: true });
    state = { baseId, manifest: base };
    writeJsonAtomic(stateFile, state);
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });     // restos de una actualización interrumpida
  setInstalled(state.manifest);
  return { base, installed };
}

function setInstalled(manifest) {
  installed = manifest;
  fileSet = new Set(manifest.files.map((f) => f.path));
}

function commit(manifest) {
  const state = readJson(stateFile);
  writeJsonAtomic(stateFile, { baseId: state.baseId, manifest });
  setInstalled(manifest);
}

// Ruta absoluta de un archivo del juego, o null si no pertenece al manifest instalado / intenta escapar.
function resolveGameFile(rel) {
  if (!fileSet.has(rel)) return null;
  const o = path.join(overlayDir, rel);
  if (fs.existsSync(o)) return o;
  const b = path.join(baseDir, rel);
  return fs.existsSync(b) ? b : null;
}

module.exports = {
  init, commit, resolveGameFile, overlayDir, tmpDir,
  getInstalled: () => installed,
};
