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
    $('size').hidden = state !== 'available';
    $('retry').hidden = !(state === 'ready' && body.dataset.offline);
  }

  function setProgress(p) {
    $('bar').style.width = p.percent + '%';
    $('track').setAttribute('aria-valuenow', String(p.percent));
    $('pct').textContent = p.percent + ' %';
    $('status').textContent = `Descargando actualización… ${mb(p.done)} de ${mb(p.total)}`;
  }

  async function check() {
    setState('checking', { status: 'Comprobando actualizaciones…' });
    delete body.dataset.offline;
    const r = await api.checkUpdate();
    if (r.status === 'available') {
      remoteBytes = r.bytes;
      $('size-mb').textContent = mb(r.bytes);
      setState('available', { status: `Nueva versión ${r.remoteVersion} lista para instalar.` });
    } else if (r.status === 'unavailable') {
      // Sin conexión o servidor caído: nunca bloquea; se juega con lo instalado.
      body.dataset.offline = '1';
      setState('ready', { status: 'Sin conexión: no se pudo buscar actualizaciones. Puedes jugar con la versión instalada.' });
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
  $('retry').addEventListener('click', check);
  $('terms-btn').addEventListener('click', async () => { $('terms').showModal(); $('terms-text').textContent = await api.getLicense(); });
  $('terms-close').addEventListener('click', () => $('terms').close());
  $('site-btn').addEventListener('click', () => api.openUrl('https://masterwar-game.hayai.com.ve/'));
  api.onUpdateProgress(setProgress);

  // Escaparate de unidades (art/units.json lo genera scripts/make-art.py): unidad grande + 2 companeros de la raza + escudos.
  async function carousel() {
    const units = await (await fetch('art/units.json')).json();
    units.forEach((u) => { new Image().src = u.src; });
    const races = [...new Set(units.map((u) => u.raceId))];
    const show$ = $('showcase'), img = $('featured-img'), nav = $('races');
    const motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    let i = 0, timer, paused = false;

    races.forEach((id) => {
      const u = units.find((x) => x.raceId === id);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'race-btn'; b.dataset.race = id; b.title = u.race; b.setAttribute('aria-label', u.race);
      b.innerHTML = '<img alt="">'; b.firstChild.src = `art/shields/${id}.png`;
      b.addEventListener('click', () => { show(units.findIndex((x) => x.raceId === id)); restart(); });
      nav.appendChild(b);
    });

    const mates = (n) => { const r = units.map((u, k) => k).filter((k) => units[k].raceId === units[n].raceId); const p = r.indexOf(n); return [r[(p + r.length - 1) % r.length], r[(p + 1) % r.length]]; };
    function show(n) {
      i = n;
      const u = units[n], [pv, nx] = mates(n);
      body.dataset.race = u.raceId;
      img.src = u.src; img.alt = `${u.name} (${u.race})`;
      $('unit-race').textContent = u.race; $('unit-name').textContent = u.name;
      [['ghost-prev', pv], ['ghost-next', nx]].forEach(([id, k]) => {
        const g = $(id); g.dataset.to = k; g.firstChild.src = units[k].src; g.setAttribute('aria-label', `Ver ${units[k].name}, ${units[k].race}`);
      });
      [...nav.children].forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.race === u.raceId)));
      show$.classList.remove('enter'); void show$.offsetWidth; show$.classList.add('enter');
    }
    ['ghost-prev', 'ghost-next'].forEach((id) => $(id).addEventListener('click', () => { show(+$(id).dataset.to); restart(); }));
    const restart = () => { clearInterval(timer); if (motion) timer = setInterval(() => { if (!paused) show((i + 1) % units.length); }, 4500); };
    [show$, nav].forEach((el) => { el.addEventListener('mouseenter', () => { paused = true; }); el.addEventListener('mouseleave', () => { paused = false; }); el.addEventListener('focusin', () => { paused = true; }); el.addEventListener('focusout', () => { paused = false; }); });
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
