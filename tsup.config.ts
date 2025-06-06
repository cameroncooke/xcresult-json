import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  shims: true,
  minify: true,
  target: 'node18',
  sourcemap: true,
  splitting: false,
  outDir: 'dist',
  esbuildOptions(options) {
    options.platform = 'node';
  },
});