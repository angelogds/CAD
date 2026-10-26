const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs/entrega');
fs.mkdirSync(output, { recursive: true });
function render(file, locals) {
  const filename = path.join(root, file);
  return ejs.render(fs.readFileSync(filename, 'utf8'), { layout() {}, ...locals }, { filename });
}
function style(svg, css, metadata) {
  return svg.replace(/(<svg[^>]*>)/, '$1\n<metadata>' + metadata + '</metadata>\n<style><![CDATA[' + css + ']]></style>').replace(/[ \t]+\n/g, '\n');
}
const decanters = render('views/automacao/decanters.ejs', {});
const definitions = decanters.match(/<svg class="dec-symbols"[\s\S]*?(<defs>[\s\S]*?<\/defs>)[\s\S]*?<\/svg>/)[1];
let decSvg = decanters.match(/<svg id="dec-process-svg"[\s\S]*?<\/svg>/)[0];
decSvg = decSvg.replace(/(<svg[^>]*>)/, '$1\n' + definitions);
const decCss = fs.readFileSync(path.join(root, 'public/css/automacao-decanters.css'), 'utf8');
fs.writeFileSync(path.join(output, '2A-Circuito-Decanters-V2.svg'), style(decSvg, decCss,
  '2A Automação Industrial. Circuito conceitual sem escala e sem leituras de campo. Armazenamento futuro separado da alimentação.'));
const digestores = render('views/automacao/partials/digestores-circuito.ejs', { controls: false });
let digSvg = digestores.match(/<svg viewBox=[\s\S]*?<\/svg>/)[0]
  .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" id="digestores-circuito-panel" data-mode="LIVE" data-running="false" ')
  .replace(/\shidden(?=\s|\/?>)/g, ' hidden="hidden"');
let digCss = fs.readFileSync(path.join(root, 'public/css/automacao-digestores-circuito.css'), 'utf8');
const vars = Object.fromEntries([...digCss.matchAll(/(--circuito-[\w-]+):([^;}]+)/g)].map(match => [match[1], match[2]]));
digCss = digCss.replace(/var\((--circuito-[\w-]+)\)/g, (_, key) => vars[key] || '#555');
digCss += '\n[hidden],.circuito-flow{display:none!important}text{font-family:Arial,sans-serif}';
fs.writeFileSync(path.join(output, '2A-Circuito-Digestores-V2.svg'), style(digSvg, digCss,
  '2A Automação Industrial. Digestores elevados, rosca superior, guilhotinas, percoladora frontal e tacho esquerdo. Sem escala ou estados mecânicos reais.'));
console.log('Desenhos conceituais SVG dos dois circuitos exportados em docs/entrega.');
