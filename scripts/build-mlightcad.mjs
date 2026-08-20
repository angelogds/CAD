import { build } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

try {
  await build({
    root,
    configFile: false,
    publicDir: false,
    logLevel: 'info',
    build: {
      target: 'es2020',
      outDir: path.join(root, 'public/vendor/mlightcad'),
      emptyOutDir: true,
      sourcemap: true,
      minify: 'esbuild',
      lib: {
        entry: path.join(root, 'frontend/mlightcad-core.entry.js'),
        formats: ['es'],
        fileName: () => 'mlightcad-core.js'
      },
      rollupOptions: {
        output: {
          chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]'
        }
      }
    }
  });
  console.log('[CAD][MLightCAD] bundle profissional gerado em public/vendor/mlightcad');
} catch (error) {
  console.error('[CAD][MLightCAD] falha ao gerar bundle:', error?.stack || error);
  process.exitCode = 1;
}
