import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Forward only safe, non-secret deployment URL configuration into the client bundle
  // so setting either standard Node keys (APP_URL) or VITE_* keys configures OAuth & UI URLs.
  const pickPublicEnv = (...keys: string[]): string => {
    for (const key of keys) {
      const value = (process.env[key] || env[key] || '').trim();
      if (value) return value;
    }
    return '';
  };

  const configuredAppUrl = pickPublicEnv('VITE_APP_URL', 'APP_URL');
  const configuredAuthRedirectUrl = pickPublicEnv('VITE_AUTH_REDIRECT_URL', 'AUTH_REDIRECT_URL');
  const configuredAllowedOrigins = pickPublicEnv('VITE_ALLOWED_ORIGINS', 'ALLOWED_ORIGINS');

  return {
    plugins: [react()],
    define: {
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
