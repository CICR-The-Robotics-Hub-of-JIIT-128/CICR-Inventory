import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
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
  const configuredSupabaseAnonKey = pickPublicEnv('SUPABASE_ANON_KEY');
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
    esbuild: {
      drop: ['console', 'debugger'],
    },
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
