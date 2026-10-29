const fs = require('node:fs');
const path = require('node:path');

const source = path.join(__dirname, '../node_modules/jsep');
const version = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8')).version;
if (version !== '1.4.0') throw new Error('Confira o parser da calculadora antes de alterar jsep ' + version);
const target = path.join(__dirname, '../public/vendor/jsep-' + version);
fs.mkdirSync(target, { recursive: true });
fs.copyFileSync(path.join(source, 'dist/jsep.min.js'), path.join(target, 'jsep.mjs'));
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(target, 'LICENSE'));
console.log('[CAD] Parser e licença da calculadora preparados para uso local.');
