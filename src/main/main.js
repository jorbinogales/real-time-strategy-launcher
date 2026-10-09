'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, session, shell, dialog, Menu } = require('electron');

// Perfil aislado para pruebas (no toca los datos reales del usuario). Debe ir antes de cargar ./content.
if (process.env.MASTERWAR_USER_DATA) app.setPath('userData', process.env.MASTERWAR_USER_DATA);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');   // el juego usa WebAudio

const cfg = require('./config');
const content = require('./content');
const updater = require('./updater');
const gameProtocol = require('./protocol');

gameProtocol.registerScheme();

const LAUNCHER_URL = 'masterwar://launcher/index.html';
const GAME_URL = 'masterwar://game/menu.html';
let launcherWin = null, gameWin = null;

function createLauncher() {
  launcherWin = new BrowserWindow({
    width: 1100, height: 680, resizable: false, maximizable: false, fullscreenable: false,
    backgroundColor: '#0b0a08', show: false, title: 'MasterWar',
    icon: path.join(__dirname, '../../build/icon.ico'),
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#0b0a08', symbolColor: '#e8d9b0', height: 36 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  launcherWin.setMenuBarVisibility(false);
  launcherWin.once('ready-to-show', () => launcherWin.show());
  launcherWin.on('closed', () => { launcherWin = null; });
  lockNavigation(launcherWin, 'launcher');
  launcherWin.loadURL(LAUNCHER_URL);
}

function createGame() {
  gameWin = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 600, backgroundColor: '#000000', show: false, title: 'MasterWar',
    icon: path.join(__dirname, '../../build/icon.ico'), autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  gameWin.setMenuBarVisibility(false);
  gameWin.maximize();                                  // ajustable: se puede restaurar/redimensionar; F11 = pantalla completa
  gameWin.once('ready-to-show', () => { gameWin.show(); if (launcherWin) launcherWin.close(); });
  gameWin.on('closed', () => { gameWin = null; });
  gameWin.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { gameWin.setFullScreen(!gameWin.isFullScreen()); e.preventDefault(); }
  });
  lockNavigation(gameWin, 'game');
  gameWin.loadURL(GAME_URL);
}

// Solo se navega dentro de masterwar://<host>; http(s) externo va al navegador del sistema; nada de ventanas nuevas.
function lockNavigation(win, host) {
  const own = `masterwar://${host}/`;
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(own)) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url) && new URL(url).host === new URL(cfg.SITE_URL).host) shell.openExternal(url);
    return { action: 'deny' };
  });
}

const fromLauncher = (e) => !!launcherWin && e.sender === launcherWin.webContents && e.senderFrame.url.startsWith('masterwar://launcher/');
function handle(channel, fn) {
  ipcMain.handle(channel, (e, ...args) => {
    if (!fromLauncher(e)) throw new Error('IPC no autorizado');
    return fn(e, ...args);
  });
}

function registerIpc() {
  handle('mw:getState', () => ({ version: content.getInstalled().version, launcherVersion: app.getVersion(), updateBaseUrl: cfg.UPDATE_BASE_URL }));
  handle('mw:checkUpdate', () => updater.checkUpdate());
  handle('mw:startUpdate', (e) => updater.startUpdate((p) => { if (!e.sender.isDestroyed()) e.sender.send('mw:update-progress', p); }));
  handle('mw:play', () => {
    if (updater.isUpdating()) return { ok: false, error: 'Hay una actualización en curso' };
    if (!gameWin) createGame();
    return { ok: true };
  });
  handle('mw:openUrl', (_e, url) => {
    let u; try { u = new URL(url); } catch { return; }
    if (u.protocol === 'https:' && u.host === new URL(cfg.SITE_URL).host) return shell.openExternal(u.href);
  });
  handle('mw:getLicense', () => {
    const f = app.isPackaged ? path.join(process.resourcesPath, 'license-es.txt') : path.join(__dirname, '../../build/license-es.txt');
    return fs.readFileSync(f, 'utf8').replace(/^﻿/, '');
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { const w = gameWin || launcherWin; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
  app.whenReady().then(() => {
    try { content.init(); } catch (e) {
      dialog.showErrorBox('MasterWar', 'No se encontró el contenido del juego. Reinstala MasterWar.\n\n' + e.message);
      return app.quit();
    }
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'fullscreen' || perm === 'pointerLock'));
    gameProtocol.register();
    registerIpc();
    createLauncher();
  });
  app.on('window-all-closed', () => app.quit());
}
