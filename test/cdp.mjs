// Cliente CDP mínimo (WebSocket global de Node) para probar la app Electron sin dependencias extra.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch(exe, args, env, port) {
  const child = spawn(exe, [...args, `--remote-debugging-port=${port}`], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = [];
  child.stdout.on('data', (d) => log.push(String(d)));
  child.stderr.on('data', (d) => log.push(String(d)));
  child.on('exit', (c) => log.push('exit ' + c));
  return { child, log };
}

export async function targets(port, wait = 20000) {
  const t0 = Date.now();
  for (;;) {
    try { return (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter((t) => t.type === 'page'); }
    catch { if (Date.now() - t0 > wait) throw new Error('CDP no disponible'); await sleep(300); }
  }
}

export async function waitTarget(port, match, wait = 30000) {
  const t0 = Date.now();
  for (;;) {
    const t = (await targets(port, wait)).find((x) => x.url.startsWith(match));
    if (t) return t;
    if (Date.now() - t0 > wait) throw new Error('target no encontrado: ' + match);
    await sleep(300);
  }
}

export async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const events = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
    else if (d.method) events.push(d);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  return {
    send, events,
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async shot(file) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); },
    async waitFor(expr, wait = 20000) {
      const t0 = Date.now();
      for (;;) { try { const v = await this.eval(expr); if (v) return v; } catch {} if (Date.now() - t0 > wait) throw new Error('timeout esperando: ' + expr); await sleep(250); }
    },
    close: () => ws.close(),
  };
}
