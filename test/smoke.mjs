// Humo: arranca el launcher (npm start) con perfil temporal y sin servidor de updates; captura pantalla.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { launch, waitTarget, connect, sleep } from './cdp.mjs';

const root = path.resolve(import.meta.dirname, '..');
const electron = path.join(root, 'node_modules/electron/dist/electron.exe');
const out = process.argv[2] || path.join(root, '.test-tmp');
fs.mkdirSync(out, { recursive: true });
const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'mw-ud-'));
const port = 9333;
const { child, log } = await launch(electron, ['.'], { MASTERWAR_USER_DATA: ud, MASTERWAR_UPDATE_URL: 'http://127.0.0.1:1/' }, port);
try {
  const t = await waitTarget(port, 'masterwar://launcher/');
  const c = await connect(t);
  await c.waitFor(`document.body.dataset.state !== 'checking'`);
  await sleep(1200);
  console.log('estado:', await c.eval(`document.body.dataset.state`), '|', await c.eval(`document.getElementById('status').textContent`));
  console.log('version:', await c.eval(`document.getElementById('version').textContent`), '|', await c.eval(`document.getElementById('launcher-version').textContent`));
  console.log('boton:', await c.eval(`document.getElementById('action').textContent`));
  console.log('unidades en carrusel:', await c.eval(`document.querySelectorAll('#strip button').length`));
  console.log('api keys:', await c.eval(`Object.keys(window.masterwar).join(',')`), '| require?', await c.eval(`typeof require`));
  await c.shot(path.join(out, 'launcher.png'));
  c.close();
} finally { child.kill(); await sleep(500); console.log(log.join('').slice(-1500)); }
