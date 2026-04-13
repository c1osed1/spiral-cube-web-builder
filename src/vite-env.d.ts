/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Базовый URL API солвера без завершающего /. Пусто = тот же хост (прокси /api). */
  readonly VITE_SOLVER_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
