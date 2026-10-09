// Contrato IPC entre el proceso principal y el renderer del launcher (window.masterwar).
// Quien restilice el launcher solo necesita esto; no hay que tocar src/main.
export interface LauncherState {
  version: string;          // versión del juego INSTALADA (la que se muestra)
  launcherVersion: string;  // versión del launcher/instalador
  updateBaseUrl: string;
}

export type CheckUpdateResult =
  | { status: 'up-to-date' }
  | { status: 'available'; remoteVersion: string; bytes: number; files: number }  // bytes = solo lo nuevo/cambiado
  | { status: 'unavailable'; message: string }   // sin red / servidor caído: se puede JUGAR igual
  | { status: 'busy' };

export interface UpdateProgress { done: number; total: number; percent: number }  // bytes y 0..100

export interface MasterWarApi {
  getState(): Promise<LauncherState>;
  checkUpdate(): Promise<CheckUpdateResult>;
  startUpdate(): Promise<{ ok: true; version: string } | { ok: false; error: string }>;
  play(): Promise<{ ok: boolean; error?: string }>;     // abre el juego y cierra el launcher
  openUrl(url: string): Promise<void>;                  // solo URLs https del sitio oficial
  getLicense(): Promise<string>;                        // términos y políticas (texto plano)
  onUpdateProgress(cb: (p: UpdateProgress) => void): () => void;   // devuelve la función para desuscribir
}

declare global { interface Window { masterwar: MasterWarApi } }
