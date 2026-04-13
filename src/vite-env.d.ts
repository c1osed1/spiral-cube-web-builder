/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Базовый URL API солвера без завершающего /. Пусто = тот же хост (прокси /api). */
  readonly VITE_SOLVER_API?: string;
  /** Порт Node-солвера для WebSocket в dev (по умолчанию 8787, как у `npm run server`). */
  readonly VITE_SOLVER_WS_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
