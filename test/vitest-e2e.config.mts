import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // El compilador por defecto de Vitest (esbuild) no emite la metadata de los
  // decoradores, y sin ella Nest no puede inyectar dependencias. SWC sí la emite.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    root: '.',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['test/setup/global-setup.ts'],
    // Todos los archivos comparten una base: en paralelo, uno restauraría el seed en medio de otro.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
