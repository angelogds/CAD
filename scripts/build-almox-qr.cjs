const fs = require('node:fs');
const path = require('node:path');
const source = path.dirname(require.resolve('jsqr/package.json'));
const target = path.join(__dirname, '../public/vendor/almox-qr');
fs.mkdirSync(target, { recursive: true });
fs.copyFileSync(path.join(source, 'dist/jsQR.js'), path.join(target, 'jsQR.js'));
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(target, 'LICENSE.txt'));
