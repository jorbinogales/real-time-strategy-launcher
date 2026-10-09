# MasterWar Launcher + Instalador

Instalador (`MasterWar-Setup-<versión>.exe`) y launcher de escritorio de **MasterWar** (RTS 3D web en Three.js).
Proyecto independiente: el juego (`C:/dev/rts`) y el sitio (`C:/dev/rts-landing`) son solo fuentes de lectura.

## Estructura

```
VERSION                      versión del contenido (semver, empieza en 0.1.0). Única fuente de verdad.
electron-builder.config.cjs  instalador NSIS asistido (lee VERSION)
build/                       license-es.txt (términos), installer.nsh (páginas/% en español), icon.ico, *.bmp (generados)
src/main/                    proceso principal: main, protocol (masterwar://), content (estado), updater, manifest (lógica pura), config
src/preload/                 preload mínimo + masterwar.d.ts (contrato IPC tipado)
launcher/renderer/           UI del launcher: index.html + styles.css + app.js  (<- lo único que hay que tocar para restilizar)
launcher/renderer/art/       arte (hero, unidades, escudos, logo) generado por scripts/make-art.py
scripts/                     build-content, publish-prepare, make-art.py, fetch-fonts
vendor-src/fonts/            Lilita One + MedievalSharp (woff2) vendorizadas
content/                     (generado, no versionado) copia filtrada del juego + manifest.json
dist/                        (generado) el .exe
dist-updates/                (generado) carpeta lista para subir al servidor de updates
test/                        unit.mjs, smoke.mjs, e2e.mjs (CDP), cdp.mjs, gui-install.py
```

## Reconstruir

```
npm install
npm run art              # opcional: regenera arte/BMPs del instalador desde C:/dev/rts-landing/public (Python + Pillow)
npm run build:content    # copia el juego -> content/ (vendoriza three r160 y fuentes, genera manifest.json)
npm run dist             # -> dist/MasterWar-Setup-<VERSION>.exe  y copia dist/MasterWar-Setup.exe (nombre fijo, p. ej. para un GitHub Release)
npm start                # ejecuta el launcher sin instalar (usa content/)
npm run test:unit        # lógica de manifests
node test/e2e.mjs        # E2E real contra la app (ver "Verificación")
```

`GAME_SRC` cambia la ruta del juego (por defecto `C:/dev/rts`).

## Publicar una versión nueva (actualizaciones)

1. Cambiar el juego en `C:/dev/rts`, subir `VERSION` (p. ej. `0.1.1`).
2. `npm run build:content && npm run publish:prepare` -> genera `dist-updates/` con `manifest.json` y `files/<ruta>`.
3. Subir **el contenido** de `dist-updates/` a `UPDATE_BASE_URL` (por defecto `https://masterwar-game.hayai.com.ve/updates/`); `manifest.json` al final.
4. (Opcional) `npm run dist` para un instalador nuevo con la versión nueva para descargas nuevas desde la landing.

Estructura que debe servir el servidor (archivos estáticos, sin lógica):

```
<UPDATE_BASE_URL>/manifest.json            { "version": "0.1.1", "generatedAt": "...", "files": [ { "path": "assets/x.glb", "size": 123, "sha256": "<hex64>" } ] }
<UPDATE_BASE_URL>/files/<path>             el archivo (ruta URL-encoded por segmento), p. ej. /files/assets/units/human/soldado.glb
```

Solo se descargan los archivos nuevos/cambiados (por sha256). Recomendado: `manifest.json` con `Cache-Control: no-cache`; `files/*` cacheables.
Para cambiar el servidor por defecto edita `src/main/config.js` (o la variable de entorno `MASTERWAR_UPDATE_URL`, útil para pruebas).
`http://` solo se acepta para `localhost`/`127.0.0.1`.

## Decisiones técnicas (y por qué)

- **Electron + electron-builder NSIS asistido** (`oneClick:false`): cumple bienvenida con arte -> licencia -> ubicación -> progreso -> "Iniciar MasterWar", con idioma español, accesos directos (escritorio + menú inicio) y desinstalador. Instalación **por usuario** (sin UAC, `%LOCALAPPDATA%\Programs\MasterWar` por defecto, la ubicación es elegible).
- **Contenido del juego como archivos reales** (fuera del asar): el instalador lo trae completo (juego jugable offline) y el updater trabaja sobre archivos reales. `npm run dist` ejecuta antes `scripts/pack-content.mjs` (`content/` -> `build/content.7z`, 7z de `electron-winstaller`) e `installer.nsh` lo extrae en `resources/content` con `Nsis7z::ExtractWithCallback`, que llama a una función NSIS desde el hilo de instalación y permite mostrar **"Copiando archivos del juego... NN %"** (0-100) en la pantalla de progreso. (Un temporizador de UI ejecutando código NSIS durante la extracción tumba el instalador: no usar.) La primera fase (runtime de Electron, pocos segundos) solo muestra la barra.
- **Protocolo privilegiado `masterwar://game/...`** (standard+secure+supportFetchAPI+stream) con soporte `Range`/206/416: origen estable => `localStorage` (`rts.settings`, `rts.saves`) persiste entre sesiones; `fetch`, WebAudio y GLTF funcionan. Sin `file://` ni puerto aleatorio. El launcher se sirve por `masterwar://launcher/` con CSP estricta (`default-src 'self'`).
- **Actualizaciones por overlay**: los archivos descargados van a `%APPDATA%\MasterWar\updates\content` (con prioridad sobre `resources/content`); el manifest instalado se guarda en `%APPDATA%\MasterWar\content-state.json`. Descarga a `updates\tmp` verificando tamaño y sha256 de **cada** archivo; solo si todo es correcto se mueve (rename por archivo) y se confirma el manifest al final. Si algo falla, lo instalado queda intacto. El protocolo solo sirve rutas listadas en el manifest instalado (anti-traversal). Si el instalador se reinstala/recompila, el contenido base vuelve a mandar (el overlay se descarta).
- **Sin red = se puede jugar**: si la consulta falla, el launcher muestra JUGAR con la versión instalada.
- **Vendorización (build:content)**: detecta los `three/addons/...` que usan `index.html`/`menu.html` (GLTFLoader, meshopt_decoder, SkeletonUtils + su cierre: BufferGeometryUtils), copia `three@0.160.0` (devDependency exacta) a `content/vendor/three` y reescribe el importmap **de la copia**. Google Fonts (`Lilita One`, `MedievalSharp`) se descargan una vez (`scripts/fetch-fonts.mjs`, versionadas en `vendor-src/fonts`, licencia OFL) y se enlazan localmente. El build avisa si queda algún recurso remoto. Resultado: el juego instalado no hace ninguna petición externa.
- **Seguridad Electron**: `contextIsolation`, `sandbox`, sin `nodeIntegration`; preload con 7 funciones (`getState, checkUpdate, startUpdate, play, openUrl, getLicense, onUpdateProgress`); IPC solo desde el frame del launcher; el renderer nunca indica qué archivos descargar; el manifest remoto se valida (rutas, hashes, tamaños); navegación bloqueada fuera de `masterwar://`; permisos denegados salvo fullscreen/pointerLock.
- **Datos del usuario**: viven en el perfil de Electron (`%APPDATA%\MasterWar`). El updater no los toca, el instalador sobre una versión previa no los toca y el desinstalador **no** los borra (`deleteAppDataOnUninstall:false`; lo dice en su pantalla de detalles).
- **Ventana de juego**: `BrowserWindow` maximizada, redimensionable, F11 = pantalla completa; al abrirla se cierra el launcher y al cerrar el juego se cierra la app.
- **Compresión**: `normal` (LZMA). El contenido ya está comprimido (mp3/png/glb meshopt), `MASTERWAR_COMPRESSION=store` acelera el build a costa de tamaño.

## Aviso: sin firma de código

El .exe **no está firmado**. Windows SmartScreen mostrará "Windows protegió su PC" ("Editor desconocido"; el usuario debe elegir *Más información > Ejecutar de todas formas*) hasta que se firme con un certificado de firma de código (idealmente EV) o se acumule reputación. Para firmar: variables `CSC_LINK` / `CSC_KEY_PASSWORD` y `npm run dist`.

## Términos y políticas

`build/license-es.txt` (se muestra en el instalador y en el launcher, botón "Términos y políticas"). **Es un borrador y requiere revisión legal**; incluye al inicio, destacada, la declaración de que MasterWar fue creado con IA y que ningún elemento fue tomado de otro videojuego. El correo de contacto (`contacto@hayai.com.ve`) está marcado como pendiente de confirmar.

## Para quien restilice el launcher (L.E.O.A.R.T)

Solo `launcher/renderer/{index.html,styles.css}` (y las imágenes de `art/`). La lógica está en `app.js` y se engancha a ids y a `body[data-state]` = `checking | ready | available | updating | error`. El contrato con el proceso principal es `src/preload/masterwar.d.ts`. La ventana es 1100x680 con barra de título oculta (`titleBarOverlay`, deja ~140 px libres arriba a la derecha para los botones nativos). `npm run art` regenera el arte.

## Verificación realizada (0.1.0, Windows 11, Node 24, Electron 44)

- `npm run dist` x2: mismo tamaño exacto, 440.660.804 bytes (420,2 MiB), ~4 min; los hashes difieren (timestamps), es reproducible funcionalmente, no bit a bit.
- `node test/unit.mjs` (manifests) y `node test/e2e.mjs` (CDP) pasan tanto con `npm start` como contra el .exe **instalado** en silencio (`/S /D=<carpeta>`, 44 s): versión, arte, update simulado 0.1.1 (8,1 MB, solo archivos cambiados), hash corrupto rechazado sin tocar lo instalado, update correcto, `.glb` con Range 206/416, 404 fuera del manifest, juego sin peticiones remotas, `localStorage` persistente entre sesiones. Desinstalación silenciosa OK (no borra `%APPDATA%\MasterWar`).
- Instalador gráfico recorrido con `test/gui-install.py` (capturas solo de su ventana): bienvenida con arte, licencia en español, ubicación, progreso, final con "Iniciar MasterWar"; el launcher arranca desde esa casilla.
- Porcentaje en la pantalla de progreso verificado con `test/gui-install.py`: "Copiando archivos del juego... NN %" sube de 0 a 100 %; instalación a carpeta elegida, por defecto (`%LOCALAPPDATA%\Programs\MasterWar`), `/S /D=` y desinstalación (borra todo `resources/content`) OK.
- No verificado: desinstalador gráfico, instalación sobre una versión previa, SmartScreen, equipos sin GPU/otros Windows.
