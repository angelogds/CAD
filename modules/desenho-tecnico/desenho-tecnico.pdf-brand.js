const path = require('node:path');

const logo = path.join(__dirname, '..', '..', 'public', 'IMG', 'login_campo_do_gado.png.png.png');

function drawBrandLogo(doc, x, y, width, height) {
  try {
    doc.image(logo, x, y, { fit: [width, height], align: 'center', valign: 'center' });
    return true;
  } catch (_error) {
    return false;
  }
}

module.exports = { drawBrandLogo };
