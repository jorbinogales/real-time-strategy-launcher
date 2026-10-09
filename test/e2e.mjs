// E2E contra la app real (sin instalar: `node test/e2e.mjs`; instalada: `node test/e2e.mjs "<ruta a MasterWar.exe>"`).
// Levanta un servidor de updates local con la 0.1.1 (menu.html cambiado + archivo nuevo de 8 MB) y comprueba:
// arranque, versión/arte, protocolo con Range, detección de update (MB), hash corrupto rechazado, update correcto,
// juego sirviendo el contenido actualizado, y persistencia de localStorage entre sesiones.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { launch, waitTarget, connect, sleep } from './cdp.mjs';

const root = path.resolve(import.meta.dirname, '..');
const exe = process.argv[2] || path.join(root, 'node_modules/electron/dist/electron.exe');
const args = process.argv[2] ? [] : ['.'];
const out = path.join(root, '.test-tmp', process.argv[2] ? 'installed' : 'dev');
fs.mkdirSync(out, { recursive: true });
const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'mw-e2e-'));
const PORT = 9334, SRV = 8765;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
let fails = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}${extra ? ' -> ' + extra : ''}`); if (!ok) fails++; };

// ---- remoto 0.1.1
const base = JSON.parse(fs.readFileSync(path.join(root, 'content/manifest.json'), 'utf8'));
const menu = fs.readFileSync(path.join(root, 'content/menu.html'));
const menu2 = Buffer.concat([menu, Buffer.from('\n<!-- MW-UPDATE-0.1.1 -->\n')]);
const pack = crypto.randomBytes(8 * 1024 * 1024);
const remoteFiles = new Map([['menu.html', menu2], ['assets/test/pack.bin', pack]]);
const remote = { version: '0.1.1', generatedAt: new Date().toISOString(), files: base.files.filter((f) => f.path !== 'menu.html').concat(
  [...remoteFiles].map(([p, b]) => ({ path: p, size: b.length, sha256: sha(b) }))) };
const expectedBytes = menu2.length + pack.length;
const state = { corrupt: false, hits: [] };
const server = http.createServer(async (req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  state.hits.push(u);
  if (u === '/manifest.json') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(remote)); }
  const m = /^\/files\/(.+)$/.exec(u);
  if (m && remoteFiles.has(m[1])) {
    let b = remoteFiles.get(m[1]);
    if (state.corrupt && m[1] === 'assets/test/pack.bin') { b = Buffer.from(b); b[1000] ^= 0xff; }
    res.setHeader('content-length', b.length);
    for (let o = 0; o < b.length; o += 1024 * 1024) { res.write(b.subarray(o, o + 1024 * 1024)); await sleep(m[1].endsWith('.bin') ? 350 : 0); }
    return res.end();
  }
  res.statusCode = 404; res.end();
});
await new Promise((r) => server.listen(SRV, '127.0.0.1', r));

const env = { MASTERWAR_USER_DATA: ud, MASTERWAR_UPDATE_URL: `http://127.0.0.1:${SRV}/` };
let app = await launch(exe, args, env, PORT);
const text = (c, id) => c.eval(`document.getElementById('${id}').textContent`);
try {
  // ---- 1. arranque + update detectado
  let c = await connect(await waitTarget(port(), 'masterwar://launcher/'));
  await c.waitFor(`document.body.dataset.state === 'available'`);
  check('launcher arranca y detecta actualización', true);
  check('muestra versión instalada 0.1.0', (await text(c, 'version')).includes('0.1.0'), await text(c, 'version'));
  const status = await text(c, 'status');
  const mbShown = Number(/([\d,]+) MB/.exec(status)?.[1].replace(',', '.'));
  check('muestra cantidad a actualizar (solo cambiados)', Math.abs(mbShown - expectedBytes / 1048576) < 0.1, `${status} (esperado ${(expectedBytes / 1048576).toFixed(1)} MB)`);
  check('botón ACTUALIZAR en lugar de JUGAR', (await text(c, 'action')) === 'ACTUALIZAR');
  check('arte: hero y 16 unidades', (await c.eval(`document.querySelectorAll('#strip button').length`)) === 16 && (await c.eval(`getComputedStyle(document.querySelector('.bg')).backgroundImage.includes('hero.jpg')`)));
  await c.shot(path.join(out, '1-update-disponible.png'));

  // ---- 2. update con archivo corrupto: se rechaza y no se toca lo instalado
  state.corrupt = true;
  await c.eval(`document.getElementById('action').click()`);
  await c.waitFor(`document.body.dataset.state === 'error'`, 40000);
  check('hash corrupto rechazado (estado error)', true, await text(c, 'status'));
  check('versión instalada sigue 0.1.0 tras fallo', (await text(c, 'version')).includes('0.1.0'));
  await c.shot(path.join(out, '2-error-hash.png'));

  // ---- 3. update correcto (con captura a mitad de progreso)
  state.corrupt = false;
  await c.eval(`document.getElementById('action').click()`);                 // REINTENTAR -> check
  await c.waitFor(`document.body.dataset.state === 'available'`);
  await c.eval(`document.getElementById('action').click()`);
  await c.waitFor(`document.body.dataset.state === 'updating' && parseInt(document.getElementById('pct').textContent) > 15`, 20000);
  await c.shot(path.join(out, '3-actualizando.png'));
  const pctMid = await text(c, 'pct');
  await c.waitFor(`document.body.dataset.state === 'ready'`, 40000);
  check('barra de progreso con %', /\d+ %/.test(pctMid), pctMid);
  check('tras actualizar vuelve JUGAR y versión 0.1.1', (await text(c, 'action')) === 'JUGAR' && (await text(c, 'version')).includes('0.1.1'), await text(c, 'status'));
  const overlayPack = path.join(ud, 'updates/content/assets/test/pack.bin');
  check('archivo nuevo en disco con sha256 correcto', fs.existsSync(overlayPack) && sha(fs.readFileSync(overlayPack)) === remote.files.at(-1).sha256);
  check('carpeta temporal limpia', !fs.existsSync(path.join(ud, 'updates/tmp')));
  const downloaded = state.hits.filter((h) => h.startsWith('/files/'));
  check('solo se pidieron archivos cambiados', [...new Set(downloaded)].sort().join() === '/files/assets/test/pack.bin,/files/menu.html', [...new Set(downloaded)].join());
  await c.shot(path.join(out, '4-actualizado.png'));

  // ---- 4. JUGAR -> ventana de juego
  await c.eval(`document.getElementById('action').click()`);
  const g = await connect(await waitTarget(port(), 'masterwar://game/'));
  await g.waitFor(`document.readyState === 'complete'`);
  await sleep(4000);
  check('juego en masterwar://game/menu.html', (await g.eval('location.href')) === 'masterwar://game/menu.html');
  check('menu.html servido es el actualizado (overlay)', (await g.eval(`fetch('menu.html').then(r=>r.text()).then(t=>t.includes('MW-UPDATE-0.1.1'))`)));
  check('index.html servido', (await g.eval(`fetch('index.html').then(r=>r.status+' '+r.headers.get('content-type'))`)).startsWith('200 text/html'));
  const glb = await g.eval(`(async()=>{ const u='assets/environment/'+${JSON.stringify(fs.readdirSync(path.join(root, 'content/assets/environment')).find((f) => f.endsWith('.glb')))};
    const full=await fetch(u); const total=Number(full.headers.get('content-length')); await full.body.cancel();
    const r=await fetch(u,{headers:{Range:'bytes=0-15'}}); const b=new Uint8Array(await r.arrayBuffer());
    const r2=await fetch(u,{headers:{Range:'bytes=-8'}}); const b2=await r2.arrayBuffer();
    const r3=await fetch(u,{headers:{Range:'bytes='+(total+10)+'-'}});
    return {total,status:r.status,cr:r.headers.get('content-range'),ct:r.headers.get('content-type'),len:b.length,magic:String.fromCharCode(...b.slice(0,4)),s2:r2.status,l2:b2.byteLength,s3:r3.status}; })()`);
  check('.glb con Range (206, glTF, Content-Range)', glb.status === 206 && glb.len === 16 && glb.magic === 'glTF' && glb.cr === `bytes 0-15/${glb.total}` && glb.ct === 'model/gltf-binary' && glb.s2 === 206 && glb.l2 === 8 && glb.s3 === 416, JSON.stringify(glb));
  check('404 fuera del manifest / traversal', (await g.eval(`Promise.all([fetch('nada.html'),fetch('../package.json'),fetch('manifest.json')]).then(r=>r.map(x=>x.status).join())`)) === '404,404,404');
  const remoteRes = await g.eval(`performance.getEntriesByType('resource').map(r=>r.name).filter(n=>!n.startsWith('masterwar://game/')&&!n.startsWith('data:')&&!n.startsWith('blob:'))`);
  check('el juego no pide recursos remotos (three/fuentes locales)', remoteRes.length === 0, JSON.stringify(remoteRes));
  const jsErrors = g.events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.text + ' ' + (e.params.exceptionDetails.exception?.description || '').slice(0, 200));
  check('menu sin excepciones JS', jsErrors.length === 0, jsErrors.join(' | '));
  const fonts = await g.eval(`document.fonts.check("20px 'Lilita One'") && document.fonts.check("20px 'MedievalSharp'")`);
  check('fuentes locales (Lilita One / MedievalSharp) cargadas', fonts);
  const threeOk = await g.eval(`import('three').then(m=>!!m.REVISION && m.REVISION)`);
  check('three vendorizado importable por importmap (r160)', threeOk === '160', String(threeOk));
  await g.eval(`localStorage.setItem('rts.settings', JSON.stringify({master:37,quality:'media'}))`);
  await g.shot(path.join(out, '5-juego-menu.png'));
  // carga la página del juego (index.html) para ver que arranca three + GLTF + meshopt
  await g.eval(`location.href='index.html?play=1&mode=skirmish&race=humanos'`);
  await sleep(14000);
  const idxErr = g.events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => (e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text).slice(0, 200));
  check('partida (index.html?play=1) carga sin excepciones', idxErr.length === jsErrors.length, idxErr.slice(jsErrors.length).join(' | '));
  check('partida: canvas WebGL activo y sin recursos remotos', await g.eval(`!!document.querySelector('canvas') && performance.getEntriesByType('resource').every(r=>r.name.startsWith('masterwar://game/')||r.name.startsWith('blob:')||r.name.startsWith('data:'))`));
  await g.shot(path.join(out, '6-juego-index.png'));
  g.close(); c.close();

  // ---- 5. persistencia de localStorage entre sesiones + versión actualizada persiste
  app.child.kill(); await sleep(2500);
  app = await launch(exe, args, env, PORT);
  c = await connect(await waitTarget(port(), 'masterwar://launcher/'));
  await c.waitFor(`document.body.dataset.state === 'ready'`);
  check('tras reiniciar: versión 0.1.1 persiste y no hay update', (await text(c, 'version')).includes('0.1.1') && (await text(c, 'action')) === 'JUGAR', await text(c, 'status'));
  await c.eval(`document.getElementById('action').click()`);
  const g2 = await connect(await waitTarget(port(), 'masterwar://game/'));
  await g2.waitFor(`document.readyState === 'complete'`);
  check('localStorage (rts.settings) persiste entre sesiones', (await g2.eval(`localStorage.getItem('rts.settings')`)) === '{"master":37,"quality":"media"}');
  g2.close();
} catch (e) { console.log('EXCEPCION', e.message); fails++; }
finally { app.child.kill(); server.close(); await sleep(800); if (fails) console.log(app.log.join('').slice(-1500)); }
console.log(fails ? `\n${fails} FALLO(S)` : '\nTODO OK');
process.exit(fails ? 1 : 0);
function port() { return PORT; }
