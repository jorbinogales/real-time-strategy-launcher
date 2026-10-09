// Pruebas unitarias de la lógica de manifests (node test/unit.mjs). Sin dependencias.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { compareVersions, validateManifest, diffManifests } = createRequire(import.meta.url)('../src/main/manifest.js');

const h = (c) => c.repeat(64);
const f = (path, c, size = 10) => ({ path, size, sha256: h(c) });
const m = (version, files) => ({ version, files });

assert.equal(compareVersions('0.1.10', '0.1.9'), 1);
assert.equal(compareVersions('0.2.0', '0.10.0'), -1);
assert.equal(compareVersions('1.0.0', '1.0.0'), 0);

// versión mayor: solo cambiados/nuevos, con su tamaño; borrados listados
let d = diffManifests(m('0.1.0', [f('a', 'a', 5), f('b', 'b', 7), f('old', 'e')]), m('0.1.1', [f('a', 'a', 5), f('b', 'c', 9), f('n', 'd', 3)]));
assert.equal(d.available, true); assert.deepEqual(d.files.map((x) => x.path), ['b', 'n']); assert.equal(d.bytes, 12); assert.deepEqual(d.removed, ['old']);
// misma versión y mismos hashes: nada
d = diffManifests(m('0.1.0', [f('a', 'a')]), m('0.1.0', [f('a', 'a')])); assert.equal(d.available, false);
// misma versión pero hash distinto: reparación
d = diffManifests(m('0.1.0', [f('a', 'a')]), m('0.1.0', [f('a', 'b')])); assert.equal(d.available, true);
// versión remota menor: nunca se baja
d = diffManifests(m('0.2.0', [f('a', 'a')]), m('0.1.0', [f('a', 'b')])); assert.equal(d.available, false);
// solo sube la versión, sin archivos: 0 bytes pero hay update
d = diffManifests(m('0.1.0', [f('a', 'a')]), m('0.1.1', [f('a', 'a')])); assert.equal(d.available, true); assert.equal(d.bytes, 0);

// validación: un manifest remoto no puede escapar de la carpeta de contenido
for (const bad of ['../x', 'a/../b', '/abs', 'C:/x', 'a\\b', './a', 'a//b', '']) assert.throws(() => validateManifest(m('0.1.0', [f(bad, 'a')])), undefined, bad);
assert.throws(() => validateManifest(m('1.0', [])));
assert.throws(() => validateManifest(m('0.1.0', [{ path: 'a', size: -1, sha256: h('a') }])));
assert.throws(() => validateManifest(m('0.1.0', [{ path: 'a', size: 1, sha256: 'xyz' }])));
assert.throws(() => validateManifest(m('0.1.0', [f('a', 'a'), f('a', 'b')])));
validateManifest(m('0.1.0', [f('assets/sounds/x y.mp3', 'a')]));
console.log('unit OK');
