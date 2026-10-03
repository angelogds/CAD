const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('perfil Coordenador da Reciclagem existe no RBAC e cadastro',()=>{
 const rbac=read('config/rbac.js');
 const controller=read('modules/usuarios/usuarios.controller.js');
 const service=read('modules/usuarios/usuarios.service.js');
 assert.match(rbac,/COORDENADOR_RECICLAGEM/);
 assert.match(controller,/Coordenador da Reciclagem/);
 assert.match(service,/COORDENADOR_RECICLAGEM/);
});

test('coordenador recebe operações escopadas sem ganhar privilégios globais',()=>{
 const { canAccessModule } = require('../config/rbac');
 ['acompanhamento_compras','compras_reciclagem_read','compras_reciclagem_manage','solicitacoes_reciclagem_read','solicitacoes_reciclagem_create','solicitacoes_reciclagem_manage','solicitacoes_reciclagem_delete'].forEach(key=>{
   assert.equal(canAccessModule('COORDENADOR_RECICLAGEM',key),true,key);
 });
 ['compras','compras_read','compras_manage','compras_delete','solicitacoes_read','solicitacoes_create','solicitacoes_manage','solicitacoes_delete','diretoria_aprovacao','pre_solicitacao_setor_approve','almoxarifado_manage','pcm_manage','preventivas_manage','os_open'].forEach(key=>{
   assert.equal(canAccessModule('COORDENADOR_RECICLAGEM',key),false,key);
 });
});

test('coordenador não recebe privilégios administrativos sensíveis',()=>{
 const rbac=read('config/rbac.js');
 ['usuarios','usuarios_delete','rh_sensitive','compras_manage','compras_delete','diretoria_aprovacao','almoxarifado_manage','estoque_manage'].forEach(key=>{
   const line=rbac.split('\n').find(l=>l.includes(key+':'));
   assert.ok(line && !line.includes('ROLE.COORDENADOR_RECICLAGEM'),key+' deve permanecer restrito');
 });
});

test('migração preserva usuários e valida foreign keys',()=>{
 const migration=read('database/migrations/215_users_add_coordenador_manutencao.js');
 assert.match(migration,/INSERT INTO .* SELECT .* FROM users/s);
 assert.match(migration,/PRAGMA foreign_key_check/);
 assert.doesNotMatch(migration,/DELETE FROM users/);
});

test('perfil deriva função e setor corretos',()=>{
 const perfil=read('modules/usuarios/usuarios.perfil.js');
 assert.match(perfil,/COORDENADOR_RECICLAGEM: \{ funcao: 'Coordenador da Reciclagem', setor: 'RECICLAGEM'/);
});
