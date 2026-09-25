// Offline visual study: real sidebar template and permission rules, no production data.
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const { normalizeRole, canAccessModule } = require('../config/rbac');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'mobile/preview');
fs.mkdirSync(out, { recursive: true });
const sidebar = ejs.render(fs.readFileSync(path.join(root, 'views/partials/sidebar.ejs'), 'utf8'), {
  user: { id: 1, role: 'ADMIN' }, normalizeRole, canAccessModule,
  activeMenu: 'dashboard', operationalCounters: {},
});
for (const filename of ['css/app.css', 'css/ui-maintenance-shell-2026.css', 'css/ui-shell-modern-2026.css', 'css/ui-buttons.css', 'css/native-menu.css', 'js/native-menu.js', 'js/app-layout.js']) {
  const target = path.join(out, filename);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, 'public', filename), target);
}
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>CAD — Prévia do aplicativo</title>
${['app','ui-maintenance-shell-2026','ui-shell-modern-2026','ui-buttons','native-menu'].map(n => `<link rel="stylesheet" href="css/${n}.css">`).join('')}
<style>.preview-hero{padding:26px;background:#fff;border:1px solid #dce7df;border-radius:22px;margin:18px 0}.preview-hero h1{font-size:28px;line-height:1.2;color:#173f2a;margin:12px 0}.preview-hero p{line-height:1.6;color:#52695c}.preview-label{font-size:10px;letter-spacing:.12em;color:#176c43;font-weight:800}.preview-button{display:block;width:100%;min-height:48px;border:0;border-radius:13px;background:#176c43;color:#fff;font:600 15px system-ui;padding:14px}.preview-notice{font-size:13px;line-height:1.6;color:#52695c;padding:16px;border:1px dashed #b7ccbf;border-radius:16px}.preview-main{padding:18px}.preview-module{padding:20px;background:#eaf4ed;border-radius:16px;margin-top:14px;color:#173f2a}</style></head>
<body><div class="app" id="appRoot">${sidebar}<main class="main"><header class="topbar"><div class="topbar-left"><button type="button" class="sidebar-toggle" id="sidebarToggle" aria-label="Abrir menu">☰</button><div class="topbar-brand-copy"><div class="topbar-title">Campo do Gado</div><div class="topbar-sub">Manutenção integrada</div></div></div></header>
<section class="preview-main"><div class="preview-hero"><span class="preview-label">PRÉVIA DO APLICATIVO</span><h1>Seu trabalho.<br>Mais perto.</h1><p>Os módulos da manutenção em um menu de cartões, feito para usar no celular.</p><button type="button" class="preview-button" id="previewOpen">Explorar o menu</button></div><div class="preview-notice">Estudo visual com o menu do CAD. Sem dados reais ou alterações no sistema. Os atalhos demonstram a navegação; as telas dos módulos serão carregadas na versão conectada.</div><div class="preview-module" id="previewModule" hidden></div></section></main></div>
<script src="js/native-menu.js"></script><script src="js/app-layout.js"></script><script>
document.getElementById('previewOpen').onclick=()=>document.getElementById('sidebarToggle').click();
document.querySelector('.sidebar').addEventListener('click', e=>{const a=e.target.closest('a[href]');if(!a)return;e.preventDefault();document.querySelectorAll('.sidebar a.active').forEach(x=>{x.classList.remove('active');x.removeAttribute('aria-current')});a.classList.add('active');a.setAttribute('aria-current','page');const box=document.getElementById('previewModule');box.hidden=false;box.textContent=a.textContent.trim()+' — módulo selecionado na prévia.';});
</script></body></html>`;
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log('Previa offline gerada em mobile/preview');
