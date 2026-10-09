'use strict';
// Configuración del launcher. Para cambiar el servidor de actualizaciones por defecto: edita esta constante y recompila
// (npm run dist). Para pruebas sin recompilar: variable de entorno MASTERWAR_UPDATE_URL.
module.exports = {
  UPDATE_BASE_URL: process.env.MASTERWAR_UPDATE_URL || 'https://masterwar-game.hayai.com.ve/updates/',
  SITE_URL: 'https://masterwar-game.hayai.com.ve/',   // único destino que openUrl permite abrir en el navegador
  MANIFEST_TIMEOUT_MS: 8000,
  DOWNLOAD_CONCURRENCY: 4,
  DOWNLOAD_RETRIES: 3,
};
