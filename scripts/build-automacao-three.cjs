const fs = require('node:fs');
const path = require('node:path');

// Mesma versão de Three.js já presente no lockfile; nenhum download/CDN em runtime.
const source = path.resolve(path.dirname(require.resolve('three')), '..');
const version = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8')).version;
if (version !== '0.172.0') throw new Error('Atualize os imports e valide a cena 2A antes de mudar Three.js ' + version);
const target = path.resolve(__dirname, '../public/vendor/three-' + version);
fs.mkdirSync(target, { recursive: true });
for (const file of ['three.core.min.js', 'three.module.min.js']) fs.copyFileSync(path.join(source, 'build', file), path.join(target, file));
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(target, 'LICENSE'));
const controls = fs.readFileSync(path.join(source, 'examples/jsm/controls/OrbitControls.js'), 'utf8');
if (!controls.includes("from 'three'")) throw new Error('Import de OrbitControls alterado; confira a geração dos assets 2A.');
fs.writeFileSync(path.join(target, 'OrbitControls.js'), controls.replace("from 'three'", "from './three.module.min.js'"));
fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ private: true, type: 'module', version }) + '\n');
console.log('[2A] Three.js ' + version + ', OrbitControls e licença preparados para servir localmente.');
