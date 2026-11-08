import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  build: { target: 'es2022', assetsInlineLimit: 0 },
  plugins: [{
    name: 'copy-gummy-assets',
    async writeBundle() {
      const { copyFile, mkdir } = await import('node:fs/promises');
      await mkdir(resolve('dist'), { recursive: true });
      await copyFile(resolve('gummy_visitors.glb'), resolve('dist/gummy_visitors.glb'));
    }
  }]
});
