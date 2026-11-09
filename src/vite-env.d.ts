/// <reference types="vite/client" />

declare const __CICR_ENV_APP_URL__: string | undefined;
declare const __CICR_ENV_AUTH_REDIRECT_URL__: string | undefined;
declare const __CICR_ENV_ALLOWED_ORIGINS__: string | undefined;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_AUTH_REDIRECT_URL?: string;
  readonly VITE_ALLOWED_ORIGINS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
