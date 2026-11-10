import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Extracts the Supabase project reference subdomain from a https://<ref>.supabase.co URL.
 */
function extractSupabaseUrlRef(urlStr: string): string {
  if (!urlStr) return '';
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    const match = host.match(/^([a-z0-9-]+)\.supabase\.co$/);
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

/**
 * Decodes the Supabase project reference ("ref") from a JWT payload without requiring secrets.
 */
function extractJwtProjectRef(token: string): string {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return '';
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    return typeof payload?.ref === 'string' ? payload.ref.trim() : '';
  } catch {
    return '';
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Forward only safe, public non-secret configuration into the client bundle
  // without requiring VITE_ prefixes in Vercel or local .env files.
  const pickPublicEnv = (...keys: string[]): string => {
    for (const key of keys) {
      const value = (process.env[key] || env[key] || '').trim();
      if (value) return value;
    }
    return '';
  };

  const configuredSupabaseUrl = pickPublicEnv('SUPABASE_URL');
  const rawSupabaseAnonKey = pickPublicEnv('SUPABASE_ANON_KEY');
  const expectedProjectRef = extractSupabaseUrlRef(configuredSupabaseUrl);
  const configuredKeyRef = extractJwtProjectRef(rawSupabaseAnonKey);

  // Guard against stale cross project SUPABASE_ANON_KEY variables in Vercel project settings
  let configuredSupabaseAnonKey = rawSupabaseAnonKey;
  if (expectedProjectRef && rawSupabaseAnonKey && configuredKeyRef && configuredKeyRef !== expectedProjectRef) {
    console.warn(
      `[cicr-vite-config] Ignoring stale SUPABASE_ANON_KEY for project "${configuredKeyRef}" because SUPABASE_URL targets "${expectedProjectRef}".`
    );
    configuredSupabaseAnonKey = '';
  }

  if (!configuredSupabaseUrl || !configuredSupabaseAnonKey) {
    console.warn(
      '[cicr-vite-config] SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env or deployment environment variables.'
    );
  }

  const configuredAppUrl = pickPublicEnv('APP_URL');
  const configuredAuthRedirectUrl = pickPublicEnv('AUTH_REDIRECT_URL');
  const configuredAllowedOrigins = pickPublicEnv('ALLOWED_ORIGINS');

  return {
    plugins: [react()],
    define: {
      __CICR_ENV_SUPABASE_URL__: JSON.stringify(configuredSupabaseUrl),
      __CICR_ENV_SUPABASE_ANON_KEY__: JSON.stringify(configuredSupabaseAnonKey),
      __CICR_ENV_APP_URL__: JSON.stringify(configuredAppUrl),
      __CICR_ENV_AUTH_REDIRECT_URL__: JSON.stringify(configuredAuthRedirectUrl),
      __CICR_ENV_ALLOWED_ORIGINS__: JSON.stringify(configuredAllowedOrigins),
    },
    ...(command === 'build'
      ? {
          esbuild: {
            drop: ['console', 'debugger'],
          },
        }
      : {}),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      open: false,
      host: true,
    },
    build: {
      target: 'esnext',
      cssCodeSplit: true,
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-framer': ['framer-motion'],
            'vendor-supabase': ['@supabase/supabase-js'],
            'vendor-icons': ['lucide-react'],
          },
        },
      },
      chunkSizeWarningLimit: 800,
    },
  };
});
