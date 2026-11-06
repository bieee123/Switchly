import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const target = mode === 'firefox' ? 'firefox' : 'chromium';

  return {
    root: fileURLToPath(new URL('./src', import.meta.url)),
    publicDir: fileURLToPath(new URL('./public', import.meta.url)),
    base: '/',
    build: {
      outDir: fileURLToPath(new URL(`./dist/${target}`, import.meta.url)),
      emptyOutDir: true,
      target: 'es2022',
      rollupOptions: {
        input: {
          popup: fileURLToPath(new URL('./src/popup/popup.html', import.meta.url)),
          import: fileURLToPath(new URL('./src/import/import.html', import.meta.url)),
        },
      },
    },
  };
});
