'use strict';
// Lógica del launcher. Solo habla con window.masterwar (ver src/preload/masterwar.d.ts).
// Estados (body[data-state]): checking | ready | available | updating | error
(() => {
  const $ = (id) => document.getElementById(id);
  const api = window.masterwar;
  const body = document.body;
  let remoteBytes = 0;

  const mb = (bytes) => { const v = bytes / 1048576; return (v < 10 ? v.toFixed(1) : Math.round(v)).toString().replace('.', ',') + ' MB'; };

  function setState(state, { status, action, secondary } = {}) {
    body.dataset.state = state;
    if (status !== undefined) $('status').textContent = status;
    const btn = $('action');
    btn.disabled = state === 'checking' || state === 'updating';
    btn.textContent = action || { checking: 'Comprobando…', ready: 'JUGAR', available: 'ACTUALIZAR', updating: 'Actualizando…', error: 'REINTENTAR' }[state];
    btn.dataset.action = { ready: 'play', available: 'update', error: 'check' }[state] || '';
    $('secondary').hidden = !secondary;
    $('progress').hidden = state !== 'updating';
  }

  function setProgress(p) {
    $('bar').style.width = p.percent + '%';
    $('track').setAttribute('aria-valuenow', String(p.percent));
    $('pct').textContent = p.percent + ' %';
    $('status').textContent = `Descargando actualización… ${mb(p.done)} de ${mb(p.total)}`;
  }

  async function check() {
    setState('checking', { status: 'Comprobando actualizaciones…' });
    const r = await api.checkUpdate();
    if (r.status === 'available') {
      remoteBytes = r.bytes;
      setState('available', { status: `Actualización disponible: ${mb(r.bytes)} (versión ${r.remoteVersion})` });
    } else if (r.status === 'unavailable') {
      // Sin conexión o servidor caído: nunca bloquea; se juega con lo instalado.
      setState('ready', { status: 'No se pudo buscar actualizaciones. Puedes jugar con la versión instalada.' });
    } else {
      setState('ready', { status: 'El juego está al día. ¡Listo para jugar!' });
    }
  }

  async function update() {
    setState('updating', { status: 'Preparando descarga…' });
    setProgress({ done: 0, total: remoteBytes, percent: 0 });
    const r = await api.startUpdate();
    if (r.ok) {
      $('version').textContent = 'Versión ' + r.version;
      await check();
    } else {
      setState('error', { status: 'La actualización falló: ' + r.error, secondary: true });
    }
  }

  async function play() {
    const r = await api.play();
    if (r && !r.ok) setState('error', { status: r.error });
  }

  $('action').addEventListener('click', () => ({ play, update, check }[$('action').dataset.action] || (() => {}))());
  $('secondary').addEventListener('click', play);
  $('terms-btn').addEventListener('click', async () => { $('terms').showModal(); $('terms-text').textContent = await api.getLicense(); });
  $('terms-close').addEventListener('click', () => $('terms').close());
  $('site-btn').addEventListener('click', () => api.openUrl('https://masterwar-game.hayai.com.ve/'));
  api.onUpdateProgress(setProgress);

  // Carrusel de unidades (art/units.json lo genera scripts/make-art.py)
  async function carousel() {
    const units = await (await fetch('art/units.json')).json();
    const strip = $('strip'), img = $('featured-img');
    let i = 0, timer;
    units.forEach((u, n) => {
      const b = document.createElement('button');
      b.type = 'button'; b.title = `${u.name} (${u.race})`; b.setAttribute('aria-label', `${u.name}, ${u.race}`);
      b.innerHTML = '<img alt="">'; b.firstChild.src = u.src;
      b.addEventListener('click', () => { show(n); restart(); });
      strip.appendChild(b);
    });
    function show(n) {
      i = n;
      img.classList.add('swap');
      setTimeout(() => {
        img.src = units[i].src; img.alt = `${units[i].name} (${units[i].race})`;
        $('unit-race').textContent = units[i].race; $('unit-name').textContent = units[i].name;
        img.classList.remove('swap');
      }, 200);
      [...strip.children].forEach((c, k) => c.setAttribute('aria-current', String(k === i)));
    }
    const restart = () => { clearInterval(timer); timer = setInterval(() => show((i + 1) % units.length), 4500); };
    show(Math.floor(Math.random() * units.length));
    restart();
  }

  (async () => {
    carousel().catch(() => {});
    const s = await api.getState();
    $('version').textContent = 'Versión ' + s.version;
    $('launcher-version').textContent = 'Launcher ' + s.launcherVersion;
    check();
  })();
})();
