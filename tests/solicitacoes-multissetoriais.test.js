const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');

test('rbac libera solicitacoes para logistica frigorifico e RH sem abrir compras',()=>{
  const r=read('config/rbac.js');
  assert.match(r,/ENCARREGADO_LOGISTICA/);
  assert.match(r,/ENCARREGADO_FRIGORIFICO/);
  assert.match(r,/solicitacoes_read:[\s\S]*ROLE\.RH/);
  assert.match(r,/solicitacoes_create:[\s\S]*ROLE\.ENCARREGADO_LOGISTICA/);
  assert.match(r,/solicitacoes_create:[\s\S]*ROLE\.ENCARREGADO_FRIGORIFICO/);
  const compras=r.match(/compras_read:\s*\[([^\]]+)\]/)?.[1]||'';
  assert.doesNotMatch(compras,/ENCARREGADO_LOGISTICA|ENCARREGADO_FRIGORIFICO|ROLE\.RH/);
});

test('usuarios aceita os novos perfis',()=>{
  const c=read('modules/usuarios/usuarios.controller.js');
  const s=read('modules/usuarios/usuarios.service.js');
  assert.match(c,/ENCARREGADO_LOGISTICA/);
  assert.match(c,/ENCARREGADO_FRIGORIFICO/);
  assert.match(s,/ENCARREGADO_LOGISTICA/);
  assert.match(s,/ENCARREGADO_FRIGORIFICO/);
});

test('backend fixa setor por perfil e impede spoof pelo formulario',()=>{
  const s=read('modules/solicitacoes/solicitacoes.service.js');
  assert.match(s,/function setorForRole/);
  assert.match(s,/ENCARREGADO_LOGISTICA.*SETOR(?:ES)?\.LOGISTICA/s);
  assert.match(s,/ENCARREGADO_FRIGORIFICO.*SETOR(?:ES)?\.FRIGORIFICO/s);
  assert.match(s,/r === "RH".*SETOR(?:ES)?\.ADMINISTRATIVO/s);
  assert.match(s,/resolveSetorOrigem\(user, setor_origem/);
  assert.match(s,/resolveSetorOrigem\(user, data\.setor_origem/);
});

test('acompanhamento usa setores corporativos e compras tem abas por setor',()=>{
  const nova=read('views/solicitacoes/new.ejs');
  const minhas=read('views/solicitacoes/minhas.ejs');
  const compras=read('views/compras/solicitacoes/index.ejs');
  assert.match(nova,/Definido automaticamente pelo perfil do usuário/);
  assert.match(minhas,/Acompanhamento das Solicitações/);
  assert.match(minhas,/Aguardando Diretoria/);
  assert.match(minhas,/Disponível para retirada/);
  assert.match(compras,/RECICLAGEM/);
  assert.match(compras,/LOGÍSTICA/);
  assert.match(compras,/FRIGORÍFICO/);
  assert.match(compras,/ADMINISTRATIVO/);
});
