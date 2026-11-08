/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GAME_API_URL?: string;
  readonly VITE_BOT_SERVICE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
