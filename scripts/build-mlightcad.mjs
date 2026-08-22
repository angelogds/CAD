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
        entry: {
          'mlightcad-core': path.join(root, 'frontend/mlightcad-core.entry.js'),
          'mlightcad-auto-dimension': path.join(root, 'frontend/mlightcad-auto-dimension.entry.js'),
          'mlightcad-auto-dimension-v3': path.join(root, 'frontend/mlightcad-auto-dimension-v3.entry.js'),
          'mlightcad-manufacturing': path.join(root, 'frontend/mlightcad-manufacturing.entry.js'),
          'mlightcad-layout-analysis': path.join(root, 'frontend/mlightcad-layout-analysis.entry.js'),
          'mlightcad-library-gdt': path.join(root, 'frontend/mlightcad-library-gdt.entry.js'),
          'mlightcad-styles': path.join(root, 'frontend/mlightcad-styles.entry.js'),
          'mlightcad-advanced-modify': path.join(root, 'frontend/mlightcad-advanced-modify.js')
        },
        formats: ['es'],
        fileName: (_format, entryName) => `${entryName}.js`
      },
      rollupOptions: {
        output: {
          chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]'
        }
      }
    }
  });
  console.log('[CAD][MLightCAD] bundles core, auto-cotas V2/V3, fabricacao, layout/analise, biblioteca/GD&T, estilos e modificadores avançados gerados em public/vendor/mlightcad');
} catch (error) {
  console.error('[CAD][MLightCAD] falha ao gerar bundle:', error?.stack || error);
  process.exitCode = 1;
}
