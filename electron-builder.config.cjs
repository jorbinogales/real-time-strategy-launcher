'use strict';
// Configuración de electron-builder (instalador NSIS asistido). La versión sale del archivo VERSION.
// MASTERWAR_CONTENT_DIR solo sirve para iterar rápido con un contenido pequeño (por defecto: content/).
const fs = require('node:fs');
const path = require('node:path');

const version = fs.readFileSync(path.join(__dirname, 'VERSION'), 'utf8').trim();
const contentDir = process.env.MASTERWAR_CONTENT_DIR || 'content';
if (!fs.existsSync(path.join(__dirname, contentDir, 'manifest.json'))) throw new Error('Falta content/manifest.json: ejecuta npm run build:content');

module.exports = {
  appId: 'com.hayai.masterwar',
  productName: 'MasterWar',
  copyright: 'MasterWar',
  extraMetadata: { version },
  directories: { output: 'dist', buildResources: 'build' },
  files: ['src/**/*', 'launcher/**/*', 'package.json', 'build/icon.ico', '!**/*.d.ts'],
  // El juego va como archivos reales (fuera del asar): el updater trabaja sobre ellos.
  extraResources: [
    { from: contentDir, to: 'content' },
    { from: 'build/license-es.txt', to: 'license-es.txt' },
  ],
  compression: process.env.MASTERWAR_COMPRESSION || 'normal',
  win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'build/icon.ico', signAndEditExecutable: true },
  nsis: {
    oneClick: false,
    perMachine: false,                        // instalación por usuario: sin admin, y el updater puede escribir sin elevar
    allowToChangeInstallationDirectory: true,
    allowElevation: true,
    createDesktopShortcut: 'always',
    createStartMenuShortcut: true,
    shortcutName: 'MasterWar',
    runAfterFinish: true,
    deleteAppDataOnUninstall: false,          // ajustes y partidas NO se borran al desinstalar
    license: 'build/license-es.txt',
    language: '3082',                         // español
    installerLanguages: ['es_ES'],            // un solo idioma: español (sin selector)
    installerIcon: 'build/icon.ico',
    uninstallerIcon: 'build/icon.ico',
    installerHeaderIcon: 'build/icon.ico',
    installerHeader: 'build/installerHeader.bmp',
    installerSidebar: 'build/installerSidebar.bmp',
    uninstallerSidebar: 'build/uninstallerSidebar.bmp',
    include: 'build/installer.nsh',
    artifactName: 'MasterWar-Setup-${version}.${ext}',
    differentialPackage: false,
    warningsAsErrors: false,
  },
  publish: null,
};
